export namespace WeatherService {
  export interface HourlyWeather {
    time?: string;
    temperature?: number;
    feelsLike?: number;
    humidity?: number;
    precipProb?: number;
    precipitation?: number;
    weatherCode?: number;
    cloudCover?: number;
    windSpeed?: number;
    windDirection?: number;
    windGusts?: number;
    uvIndex?: number;
    pressure?: number;
    visibility?: number;
    isDay?: boolean;
    description?: string;
    icon?: string;
    [key: string]: any;
  }

  export interface WeatherAPIResponse {
    timezone?: string;
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      apparent_temperature?: number[];
      relative_humidity_2m?: number[];
      precipitation_probability?: number[];
      precipitation?: number[];
      weather_code?: number[];
      cloud_cover?: number[];
      wind_speed_10m?: number[];
      wind_direction_10m?: number[];
      wind_gusts_10m?: number[];
      uv_index?: number[];
      pressure_msl?: number[];
      visibility?: number[];
      is_day?: number[];
      [key: string]: any;
    };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      apparent_temperature_max?: number[];
      apparent_temperature_min?: number[];
      sunrise?: string[];
      sunset?: string[];
      uv_index_max?: number[];
      precipitation_sum?: number[];
      precipitation_probability_max?: number[];
      wind_speed_10m_max?: number[];
      [key: string]: any;
    };
    [key: string]: any;
  }

  export interface DailyForecast {
    date: string;
    maxTemp: number;
    minTemp: number;
    weatherCode: number;
    description: string;
    icon: string;
    precipSum: number;
    precipProb: number;
    windMax: number;
    uvMax: number;
    sunrise: string;
    sunset: string;
  }

  export interface Advisory {
    type: string;
    title: string;
    desc: string;
    severity: string;
  }

  export interface OutdoorWindow {
    startIdx: number;
    endIdx: number;
    startTime: string;
    endTime: string;
    hours: number;
    avgTemp: number;
  }

  export interface DecisionTip {
    icon: string;
    text: string;
    type: string;
  }

  export interface TimelineDeltas {
    tempDiff: number | null;
    windDiff: number | null;
    pressureDiff: number | null;
    precipProbDiff: number | null;
  }

  export interface AnomalyResult {
    diff: number;
    label: string;
    severity: string;
  }

  export interface HistoricalPattern {
    weekAvg: number;
    histAvg: number;
    diff: number;
    label: string;
  }

  export interface UpwindPoint {
    lat: number;
    lng: number;
  }

  export type ConfidenceBands = (number | null)[];

  export type DiurnalBiasMap = Record<string, number>;

  export interface TrustScore {
    overall: number;
    temp: number;
    precip: number;
    wind: number;
  }

  export interface WeatherMomentum {
    velocity: number;
    acceleration: number;
  }

  export interface ParameterImportance {
    key: string;
    value: number;
    impact: number;
  }

  export interface FreshnessLabel {
    label: string;
    opacity: number;
    ageMinutes: number;
    isStale: boolean;
    isExpired: boolean;
  }

  export interface TemporalCompression {
    compressed: number[];
    originalLength: number;
    compressionRatio: number;
  }

  export interface SpatialGradient {
    points: {
      label: string;
      lat: number;
      lng: number;
      estTemp: number;
      dir: string;
    }[];
  }

  export interface WeatherRegime {
    regime: string;
    label: string;
    icon: string;
  }

  export type Briefing = string;

  export interface AnalogDay {
    year: number;
    temp: number;
    icon: string;
    desc: string;
    precip: number;
    max: number;
    min: number;
  }
}

export declare const WeatherService: any;
export default WeatherService;
