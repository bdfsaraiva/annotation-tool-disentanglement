/**
 * Reports Core Web Vitals metrics (CLS, FID, FCP, LCP, TTFB) by dynamically
 * importing the `web-vitals` library and forwarding each metric to the
 * provided callback.
 *
 * Pass any function as `onPerfEntry` to receive measurement results, e.g.
 * `console.log` during development or an analytics endpoint in production.
 *
 * @param {Function} [onPerfEntry] - Callback invoked with each metric object.
 *   No-op when not provided or not a function.
 */
const reportWebVitals = onPerfEntry => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

export default reportWebVitals;
