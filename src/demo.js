(function (root, factory) {
  const demo = factory();
  if (typeof module === "object" && module.exports) module.exports = demo;
  else root.StableDemo = demo;
})(globalThis, function () {
  "use strict";

  const scenarios = [
    { cap: 40, variation: 0.25, spikes: [] },
    { cap: 60, variation: 0.45, spikes: [] },
    { cap: 90, variation: 1.25, spikes: [410, 935, 1370, 1840, 2280] },
  ];

  return scenarios.map(({ cap, variation, spikes }) => {
    const frames = Array.from({ length: cap * 30 }, (_, index) => {
      let time = 1000 / cap + variation * Math.sin(index * 0.91);
      if (spikes.includes(index) || spikes.includes(index - 1)) time += 28;
      return (1000 / time).toFixed(3) + "," + time.toFixed(4);
    });
    return { cap, name: "demo-" + cap + "-fps.csv", csv: ["FPS,Frame Time (ms)", ...frames].join("\n") + "\n" };
  });
});
