# Stable FPS Finder v0.1.2

**By @MHYGAMER1**

Stable FPS Finder is a free, open-source tool that compares FPS caps using gameplay captures. It measures frame-time consistency, 1% Low FPS, and detected stutter events, then recommends the cap that performed best in your test. View a frame-time chart for each capture or export an HTML report.

The recommended cap is the limit to set. The measured average shows the frame rate your game actually achieved under that limit.

## Run on Windows

1. In this repository, select **Code → Download ZIP** and extract the archive.
2. Open **index.html** from the extracted folder in your browser.
3. The interface opens in Arabic. Select **English** at the top to switch languages. Your captures stay loaded when you switch.
4. Select **Load sample data** to try the tool with three simulated captures at 40, 60, and 90 FPS. The expected recommendation is 60 FPS. View the 90 FPS capture to see long frames marked in orange.
5. Select **Save HTML report** to export the recommendation, metrics, and charts in the current language.

To try CSV import, reopen the page, select **Import CSV files**, and choose the three files in **samples/**. Enter the cap shown in each filename.

Analysis runs locally in your browser and works offline. The tool needs no installation, server, or administrator access. It does not change Windows, drivers, game settings, or clock speeds. It collects no personal data, sends no telemetry, and runs no background service. Reports are saved on request and include your selected filenames.

## Compare your own gameplay captures

1. Pick a repeatable scene or route. Keep the game settings, resolution, FPS limiter, and capture tool the same. Let the game finish loading before recording.
2. Set an FPS cap in the game or in your preferred limiter. Record the same scene at two or more different caps, ideally for **30–60 seconds per run**. Repeat runs at each cap if you can.
3. Export a separate **CSV file containing one frame time per row, in milliseconds**, for each run. With **NVIDIA FrameView**, choose the file ending in **`_Log.csv`**. Any capture tool that exports a compatible CSV works.
4. Select **Import CSV files** and enter the cap you set for each capture in the **FPS cap** column.
5. Review the recommendation and charts, then apply the cap manually and try it in gameplay. The recommendation is based on the captures you imported.

## CSV format

Each row represents one frame, in chronological order. Frame times must be in milliseconds.

~~~csv
FPS,Frame Time (ms)
60.000,16.667
58.241,17.170
61.350,16.300
~~~

- The importer accepts comma-, semicolon-, and tab-delimited files encoded as UTF-8 or as UTF-16 with a byte-order mark.
- The **FPS** column is optional. The tool computes FPS metrics from frame times.
- The importer accepts **MsBetweenPresents** for a single process and swap chain. A leading zero in this column is skipped if FPS is absent or zero.
- Capture duration is the sum of frame times. Each run needs at least **15 seconds and 300 frames** to enter the comparison.
- The tool accepts up to 24 captures per session, with a 16 MiB limit per file.

## How caps are compared

| Metric | Calculation |
| --- | --- |
| Average FPS | Frame count divided by capture duration in seconds |
| 1% Low | 1,000 divided by the mean frame time of the slowest 1% of frames. The frame count is rounded up. |
| P99 | The 99th-percentile frame time, calculated using the nearest-rank method |
| Frame-time spread | Population standard deviation of frame times in milliseconds |
| Stutter events | A frame is flagged when its time is at least 1.5× the median of the previous 30 frames and at least 6 ms above that median. With fewer than six previous frames, the tool uses the full capture median. Consecutive flagged frames count as one event. |

For each FPS cap, the tool takes the median of each metric across its eligible runs. It then keeps caps within two events per minute of the lowest detected stutter rate, within 0.10 of the best P99-to-median frame-time ratio among the remaining caps, and within five percentage points of the best 1% Low-to-average FPS ratio among the remaining caps. The highest measured average FPS wins, with 1% Low as the first tie-breaker.

These thresholds are experimental. Use matching scenes and settings across captures so the comparison reflects the FPS caps you tested.

## Project files and tests

- **index.html** holds the browser interface.
- **src/analysis.js** handles CSV parsing, metrics, and cap comparison.
- **src/app.js** controls the interface, charts, and report export.
- **src/i18n.js** contains the interface and report translations.
- **src/demo.js** generates sample captures.
- **samples/** contains sample CSVs for manual import.
- **tests/analysis.test.js** contains the automated analysis tests.

Run the tests from the project folder with Node.js 20 or later.

~~~powershell
node --test tests/analysis.test.js
~~~

## License

Stable FPS Finder is free and open source under the [MIT License](LICENSE).

