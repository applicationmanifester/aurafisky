import './weather.js';

const ws = (typeof globalThis !== 'undefined' ? globalThis.WeatherService : null) || (typeof self !== 'undefined' ? self.WeatherService : null);

export { ws as WeatherService };
export default ws;
