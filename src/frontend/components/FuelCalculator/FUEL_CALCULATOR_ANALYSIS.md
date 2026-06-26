# Fuel Calculator Feature Analysis & Specifications

This document provides a comprehensive analysis of the features, user interface components, configuration settings, and structural layers of the `FuelCalculator` widget in **irDashies**.

The goal of this analysis is to document the existing architecture, separating the **Visual/UI Layer** (which must be preserved) from the **Calculation and State Layer** (which is slated for a complete rewrite from scratch).

---

## 1. Directory & File Structure

The `FuelCalculator` module is located in `src/frontend/components/FuelCalculator/`. The files are categorized as follows:

### A. Calculation & State Layer (To Be Rewritten)

- **[useFuelCalculation.tsx](./useFuelCalculation.tsx)**: The main calculation hook. Listens to telemetry, coordinates state/storage, runs mathematical projections (averages, timed-race laps remaining, smoothing, dampening, confidence), and returns the `FuelCalculation` result object.
- **[FuelStore.tsx](./FuelStore.tsx)**: Zustand store that tracks completed lap history, refueling events, qualifying consumption, and current session/context info (track + car).
- **[fuelCalculations.ts](./fuelCalculations.ts)**: Stateless utility functions containing math algorithms (IQR outlier detection, weighted/simple averages, unit conversions L/gal, lap crossing detection, and flag bitwise checks).
- **[useFuelLogger.ts](./useFuelLogger.ts)**: A hook that handles telemetry and calculation logging for debugging.

### B. Visual & UI Layer (To Be Preserved)

- **[FuelCalculator.tsx](./FuelCalculator.tsx)**: Main entry point. Fetches dashboard configuration, coordinates the frozen lap-start snapshot, applies font styles, and recursively renders the layout tree.
- **[types.ts](./types.ts)**: Contains the TypeScript definitions for the calculator settings (`FuelCalculatorSettings`) and the calculation output (`FuelCalculation`).
- **[defaults.ts](./defaults.ts)**: Defines the default widget styles, default configurations, and default layout tree.
- **[widgets/](./widgets/)**: Sub-directory housing the visual renderers:
  - [FuelCalculatorHeader.tsx](./widgets/FuelCalculatorHeader.tsx): Header rendering stops, earliest pit window, and confidence-coded laps remaining.
  - [FuelCalculatorGauge.tsx](./widgets/FuelCalculatorGauge.tsx): Visual fuel level progress bar and status indicator.
  - [FuelCalculatorConsumptionGrid.tsx](./widgets/FuelCalculatorConsumptionGrid.tsx): Table of consumption metrics (CURR, AVG, MAX, LAST, MIN, QUAL) showing use, laps possible, refuel target, and total required.
  - [FuelCalculatorPitScenarios.tsx](./widgets/FuelCalculatorPitScenarios.tsx): Displays future pit lap scenarios and fuel to add.
  - [FuelCalculatorTargetMessage.tsx](./widgets/FuelCalculatorTargetMessage.tsx): Banner showing fixed target pit lap fuel requirements.
  - [FuelCalculatorTimeEmpty.tsx](./widgets/FuelCalculatorTimeEmpty.tsx): HH:MM:SS countdown timer until fuel runs out.
  - [FuelHistory.tsx](./widgets/FuelHistory.tsx) / [ConsumptionGraphWidget.tsx](./widgets/ConsumptionGraphWidget.tsx): Histogram or line chart of recent lap consumption.
  - [FuelCalculatorConfidence.tsx](./widgets/FuelCalculatorConfidence.tsx): UI banners detailing calculation confidence and worst-case fueling targets.
  - [FuelCalculatorEconomyPredict.tsx](./widgets/FuelCalculatorEconomyPredict.tsx): Displays fuel-saving targets (L/lap or gal/lap) for different remaining lap stints.

---

## 2. Inventory of UI Components & Widgets

Every widget inside the `widgets/` folder expects the `FuelCalculation` result object (or a frozen version of it) and renders it using specific UI patterns:

### 1. Fuel Header (`fuelHeader`)

- **Purpose**: Shows high-level race status at a glance.
- **Key Render Elements**:
  - **STOPS**: Displays the estimated number of pit stops remaining (`stopsRemaining`).
  - **EARLIEST**: Displays the earliest lap to pit (`pitWindowOpen`).
  - **Laps Remaining Pill**: Displays the remaining laps (`lapsRemaining`) formatted according to the calculation `confidence`:
    - `high`: `X LAPS` (e.g., `12 LAPS`)
    - `medium`: `~X LAPS` (e.g., `~12 LAPS`)
    - `low` / `very-low`: `X-Y LAPS` (e.g., `10-12 LAPS` range).
    - `avgLaps <= 0`: `--`
  - **Confidence Dot**: A status dot next to the laps text, color-coded based on `confidence`:
    - `high`: Green (`text-green-400` / `bg-green-500`)
    - `medium`: Amber (`text-amber-400` / `bg-amber-500` / pulsing)
    - `low` / `very-low`: Red (`text-red-400` / `bg-red-500` / pulsing)

### 2. Fuel Gauge (`fuelGauge`)

- **Purpose**: Displays the current fuel level relative to the tank's maximum capacity.
- **Key Render Elements**:
  - **Fuel Text**: Formatted string of current fuel level and laps possible: `[Current Fuel] / [Laps with Fuel] laps` (e.g., `24.5 L / 8.5 laps`).
  - **Tank Capacity**: Displays maximum tank capacity (e.g., `60 L`) at the right axis boundary.
  - **Progress Bar**: A graphical bar filled to the percentage of tank capacity. It uses a gradient colored by `fuelStatus`:
    - `safe`: Green gradient (`from-green-500 to-green-400`)
    - `caution`: Amber gradient (`from-amber-500 to-amber-400`)
    - `danger`: Red gradient (`from-red-500 to-red-400`)
  - **Border styling**: The main container is wrapped in a border styling colored by `fuelStatus`.

### 3. Consumption Grid (`fuelGrid`)

- **Purpose**: Displays a grid of fuel usage, laps possible, refuel deficit/surplus, and total required for various pacing scenarios.
- **Scenarios (Rows)**:
  - `CURR`: Live projected consumption for the current lap (uses live telemetry data).
  - `AVG N`: Fuel average over custom N laps (e.g., `AVG 5`).
  - `MAX`: Maximum valid fuel consumption recorded.
  - `LAST`: Fuel used on the last completed lap.
  - `MIN`: Minimum valid fuel consumption recorded.
  - `QUAL MAX`: Maximum fuel consumption recorded during qualifying sessions.
- **Metrics (Columns)**:
  - `USE`: Pacing consumption rate in L/lap (or gal/lap).
  - `LAPS`: Number of laps possible with current fuel at this consumption rate (`fuelLevel / usage`).
  - `REFUEL`: Deficit/surplus balance. If a deficit is detected (balance < 0), shows a positive number of fuel to add wrapped in a red background pill. If a surplus is detected, shows the surplus value with a green background pill.
  - `TOTAL`: Total fuel required for the entire race distance (`totalLaps * usage`).
- **Special Rules**:
  - In practice/testing sessions, the `REFUEL` and `TOTAL` columns are hidden because remaining laps are not finite.
  - Except for the `CURR` row, all columns are computed using a **frozen snapshot of fuel level and session progress** captured at the start of each lap. This prevents grid values from bouncing around during a pit stop or mid-lap.

### 4. Pit Scenarios (`fuelScenarios`)

- **Purpose**: Helps the driver evaluate fuel strategy for future stints relative to the current lap.
- **Key Render Elements**:
  - Lists three relative scenario lap targets:
    - **Ideal stint limit**: Pitting at the maximum laps possible on current fuel.
    - **-1 Lap**: Pitting one lap early.
    - **+1 Lap**: Pitting one lap late (requiring fuel saving).
  - For each stint scenario, it displays:
    - `PIT @`: The target lap to pit (`currentLap + scenario.laps`).
    - `ADD`: The hypothetical fuel amount required to add during that pit stop to finish the race (incorporating remaining laps, safety margin, and average consumption).
    - `FINISH`: The projected remaining fuel at the finish line if that amount is added.
    - `WINDOW`: Label showing "Ideal", "-1 Lap", or "+1 Lap".
  - Color coding: Green text for "Ideal", Cyan text for "+1 Lap", Yellow text for "-1 Lap".
  - **Fixed Target Scenario**: If `enableTargetPitLap` is enabled, a fourth row is rendered for a fixed target lap (e.g., `L15`), showing its required `ADD` and `FINISH` fuel.

### 5. Target Message (`fuelTargetMessage`)

- **Purpose**: Displays a prominent target pit lap banner.
- **Key Render Elements**: Shows `TARGET L[X]` (e.g., `TARGET L15`) on the left, and the required fuel addition `Need: +[X.X]L` on the right.
- **Conditional**: Only rendered if `enableTargetPitLap` is active and a valid target lap is set.

### 6. Time Empty (`fuelTimeEmpty`)

- **Purpose**: Displays a countdown timer until the car runs out of fuel.
- **Key Render Elements**: Shows the formatted string `HH:MM:SS` representing:
  $$\text{TimeLeft} = \text{lapsWithFuel} \times \text{avgLapTime}$$
- **Color coding**: Container border is color-coded based on `fuelStatus` (Green for safe, Amber for caution, Red for danger).

### 7. Fuel History / Graph (`fuelGraph` / `historyGraph`)

- **Purpose**: Renders visual historical consumption.
- **Key Render Elements**:
  - **Histogram Mode**: Renders vertical bars for the last 15-30 valid laps. Bars are colored Red if consumption exceeded the target/average, or Green if below. If `manualTarget` is set, displays difference labels (+/- value) on the bars.
  - **Line Mode**: Renders a continuous green line connecting recent lap consumption data points.
  - **Reference Lines**: Horizontal lines across the graph representing `avg` (average consumption) and `tgt` (manual target).
  - **Legend**: Text at the bottom showing numerical averages and target limits.

### 8. Fuel Confidence (`fuelConfidence`)

- **Purpose**: Alerts the driver when calculations are based on insufficient data.
- **Key Render Elements**: Shows warnings like `⚠ Not enough data` (very-low confidence) or `⚠ Low confidence` (low/medium confidence). Indicates that strategy is fueling for the worst-case lap count (`lapsRange[1]`).

### 9. Economy Predict (`fuelEconomyPredict`)

- **Purpose**: Displays target fuel consumption rates to make stints last specific lap counts.
- **Key Render Elements**: Lists targets for Ideal, -1, and +1 laps. Shows them formatted as `L[TargetLap] [TargetRate] L/lap` (e.g., `L22 2.75 L/lap`). The current target is highlighted with a green background and green text.

---

## 3. Configuration & Settings Inventory

The `FuelCalculatorSettings` interface in [types.ts](./types.ts#L85-L175) configures the visual and analytical behavior of the calculator:

### Core Display Settings

- `showOnlyWhenOnTrack` (boolean): Widget is hidden if the player is not in the car.
- `fuelUnits` (`'L' | 'gal'`): Units to display. Liters are converted to gallons internally using a factor of `0.264172` for display.
- `layout` (`'vertical' | 'horizontal'`): Legacy layout flow (superseded by recursive layouts).
- `background.opacity` (number, 0-100): Opacity of the main background panel.
- `showFuelStatusBorder` (boolean): Enables the outer widget border which lights up Green/Amber/Red based on `fuelStatus`.

### Widget Toggles

Toggles indicating whether to display specific sub-widgets within the layout:

- `showConsumption` (boolean): Grid visibility.
- `showFuelLevel` (boolean): Gauge visibility.
- `showLapsRemaining` (boolean): Laps remaining info in headers.
- `showMin` (boolean): MIN row in grid.
- `showCurrentLap` (boolean): CURR row in grid.
- `showLastLap` (boolean): LAST row in grid.
- `show3LapAvg` (boolean): AVG row in grid.
- `show10LapAvg` (boolean): 10-lap average row in grid.
- `showMax` (boolean): MAX row in grid.
- `showQualifyConsumption` (boolean): QUAL MAX row in grid.
- `showPitWindow` (boolean): Pit scenarios list.
- `showEnduranceStrategy` (boolean): Endurance-related strategy widgets.
- `showFuelScenarios` (boolean): Target stint scenarios list.
- `showFuelRequired` (boolean): Required fuel columns.
- `showFuelHistory` (boolean): History graph container.
- `fuelHistoryType` (`'line' | 'histogram'`): Selected graph format.

### Strategy & Target Settings

- `safetyMargin` (number): Fuel buffer added to needed fuel (represented in the selected fuel unit, L or gal).
- `manualTarget` (number): A user-defined target consumption rate to draw on graphs and calculate saving scenarios.
- `fuelRequiredMode` (`'toFinish' | 'toAdd'`): Sets whether the required column represents absolute fuel needed or the net refuel addition.
- `enableTargetPitLap` (boolean): Toggles fixed target pit lap strategy.
- `targetPitLap` (number): The specific lap number the driver intends to pit.
- `targetPitLapBasis` (`'avg' | 'avg10' | 'last' | 'max' | 'min' | 'qual'`): Pacing consumption rate used to compute target pit lap fuel.
- `avgLapsCount` (number): Number of laps to aggregate for the primary `AVG` grid row.

### Styling & Layout Tree

- `layoutTree` (`LayoutNode`): Recursive split/box layout defining exactly how widgets are placed and sized.
- `widgetStyles` (Record): Custom font sizes, label/value font sizes, and bar sizes per widget.
- `consumptionGridOrder` (`string[]`): Array specifying the vertical order of grid rows (e.g. `['curr', 'avg', 'max', 'last', 'min', 'qual']`).

### Status Thresholds

- `fuelStatusThresholds` (`{ green: number, amber: number, red: number }`): Percentage of tank capacity that triggers transitions between safe, caution, and danger.
- `fuelStatusBasis` (`'last' | 'avg' | 'min' | 'max'`): Which consumption rate to use to project remaining laps for status coloring.
- `fuelStatusRedLaps` (number): A safety lap limit (e.g., 3 laps). If projected laps remaining fall below this value, the status immediately switches to `danger` (Red) regardless of fuel percentage.

### Utility Settings

- `enableStorage` (boolean): Enables loading/saving historical lap metrics.
- `enableLogging` (boolean): Enables debug telemetry files.
- `sessionVisibility` (`SessionVisibilitySettings`): Filters whether the widget is visible in Practice, Qualifying, Race, or Offline sessions.

---

## 4. Analytical Requirements (For Calculation Layer Rewrite)

When redoing the calculation hook from scratch, the following logical requirements must be met to ensure the UI functions correctly:

1.  **Refuel Offsets**: The system must track changes in `FuelLevel` mid-lap. Telemetry increases must be accumulated in `accumulatedRefuel` so that the lap's consumption math is offset correctly and doesn't register negative usage.
2.  **Lap Crossing Sync**: A lap crossing must be detected when `LapDistPct` wraps around (high-to-low transition) or `Lap` increments. A crossing event must trigger:
    - Adding a `FuelLapData` entry to store history.
    - Evaluating the lap for outlier status (IQR method).
    - Saving valid laps to the database via native bridge callbacks.
    - Resetting current lap counters.
3.  **Live Blended Projections**: The `projectedLapUsage` must start at historical reference values at the beginning of a lap and blend towards live telemetry consumption as the lap progresses. The projection must apply smoothing and slow down changes near the start/finish line to prevent spikes.
4.  **Timed Race Projection**: When a race has no lap limit (timed race), the remaining laps must be estimated using remaining session time and average lap times. Calculations for fuel addition must include a safety time cushion (e.g., 45s) to account for final lap crossings.
5.  **Qualifying Max**: In qualifying, the calculator must track and persist the highest fuel consumption lap to serve as a high-limit strategy baseline.
6.  **Context isolation**: Telemetry state must be partitioned by Track + Car. Transitions (e.g. loading a new track) must instantly clear session memory and load the database history for the new context.
7.  **Outlier Rejection**: Lap consumption data must be statistically filtered to prevent slow down-laps, tow incidents, or caution laps from distorting average fuel consumption calculations.
8.  **Lap-Start Snapshot (Freeze)**: The UI components depend on a frozen snapshot of fuel level and progress captured at the start of each lap. The calculation layer must supply the boundaries (`lastFinishedLap` and `currentLap`) that allow the entry point to coordinate this snapshot effectively.
