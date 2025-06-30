import axios from "axios";

const TELEGRAM_BOT_TOKEN = "8148338157:AAFsiUOy9sJ9eTseiq8h_pbVamyp9wniE0s";
const TELEGRAM_CHAT_ID = "819307069";

const COINDCX_API_BASE = "https://api.coindcx.com/exchange/v1";

type OHLCV = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const TIMEFRAMES = ["5m", "15m", "30m", "1h"];

// Helper to convert timeframe string to minutes
const timeframeToMinutes = (tf: string): number => {
  switch (tf) {
    case "5m":
      return 5;
    case "15m":
      return 15;
    case "30m":
      return 30;
    case "1h":
      return 60;
    default:
      return 5;
  }
};

// Fetch all trading pairs from CoinDCX
async function fetchAllPairs(): Promise<string[]> {
  try {
    const response = await axios.get(`${COINDCX_API_BASE}/markets`);
    const pairs = response.data
      .filter((m: any) => m.base_currency !== "USDT" && m.quote_currency === "USDT")
      .map((m: any) => m.market);
    return pairs;
  } catch (error) {
    console.error("Error fetching pairs:", error);
    return [];
  }
}

// Fetch OHLCV data for a pair and timeframe
async function fetchOHLCV(pair: string, timeframe: string): Promise<OHLCV[]> {
  try {
    const interval = timeframeToMinutes(timeframe);
    const response = await axios.get(
      `https://public.coindcx.com/market_data/candles?pair=${pair}&interval=${interval}`
    );
    // Response format: [timestamp, open, high, low, close, volume]
    return response.data.map((candle: any) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  } catch (error) {
    console.error(`Error fetching OHLCV for ${pair} ${timeframe}:`, error);
    return [];
  }
}

// Calculate EMA for given period
function calculateEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  let ema = data[0];
  emaArray.push(ema);
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    emaArray.push(ema);
  }
  return emaArray;
}

// Check if candle body is near EMA (within threshold)
function isBodyNearEMA(candle: OHLCV, ema: number, thresholdPercent = 0.15): boolean {
  const bodyLow = Math.min(candle.open, candle.close);
  const bodyHigh = Math.max(candle.open, candle.close);
  const threshold = ema * (thresholdPercent / 100);
  return bodyLow <= ema + threshold && bodyHigh >= ema - threshold;
}

// Check if candle is green
function isGreenCandle(candle: OHLCV): boolean {
  return candle.close > candle.open;
}

// Pattern detection for a candle index
function checkPattern(
  ohlcv: OHLCV[],
  ema9: number[],
  ema15: number[],
  ema50: number[],
  ema200: number[],
  index: number
): boolean {
  if (index < 0 || index >= ohlcv.length) return false;
  const candle = ohlcv[index];
  if (!isGreenCandle(candle)) return false;

  // Check rejection from 200 EMA and body on 9 and 15 EMA (first image pattern)
  const near9 = isBodyNearEMA(candle, ema9[index]);
  const near15 = isBodyNearEMA(candle, ema15[index]);
  const near50 = isBodyNearEMA(candle, ema50[index]);
  const near200 = isBodyNearEMA(candle, ema200[index]);

  // Pattern logic:
  // If candle body near 9 and 15 EMA (and optionally 50 EMA) and rejected from 200 EMA
  // or candle body near 9, 15, and 50 EMA (4th image pattern)
  // We consider pattern matched

  // Check if candle body near 9 and 15 EMA
  const near9and15 = near9 && near15;

  // Check if candle body near 9, 15, and 50 EMA
  const near9_15_50 = near9 && near15 && near50;

  // Check if candle rejected from 200 EMA (body not near 200 EMA but price touched or close to 200 EMA)
  // For simplicity, check if low or high is near 200 EMA but body is not near 200 EMA
  const priceTouched200 =
    Math.abs(candle.low - ema200[index]) <= (ema200[index] * 0.15) / 100 ||
    Math.abs(candle.high - ema200[index]) <= (ema200[index] * 0.15) / 100;
  const bodyNotNear200 = !near200;

  if ((priceTouched200 && bodyNotNear200 && near9and15) || near9_15_50) {
    return true;
  }

  return false;
}

// Send Telegram alert
async function sendTelegramAlert(message: string) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error sending Telegram alert:", error);
  }
}

// Main scan function
async function scan() {
  console.log("Starting scan at", new Date().toISOString());
  const pairs = await fetchAllPairs();
  if (pairs.length === 0) {
    console.log("No pairs found, skipping scan.");
    return;
  }

  for (const pair of pairs) {
    for (const timeframe of TIMEFRAMES) {
      const ohlcv = await fetchOHLCV(pair, timeframe);
      if (ohlcv.length === 0) continue;

      const closes = ohlcv.map((c) => c.close);
      const ema9 = calculateEMA(closes, 9);
      const ema15 = calculateEMA(closes, 15);
      const ema50 = calculateEMA(closes, 50);
      const ema200 = calculateEMA(closes, 200);

      // Check current candle and last 3 candles for pattern
      const lastIndex = ohlcv.length - 1;
      for (let i = lastIndex; i >= lastIndex - 3 && i >= 0; i--) {
        if (checkPattern(ohlcv, ema9, ema15, ema50, ema200, i)) {
          const candleTime = new Date(ohlcv[i].timestamp).toLocaleString();
          const message = `Pattern detected on ${pair} timeframe ${timeframe} at ${candleTime}`;
          console.log(message);
          await sendTelegramAlert(message);
          break; // Alert once per pair/timeframe per scan
        }
      }
    }
  }
  console.log("Scan completed at", new Date().toISOString());
}

// Run scan every 2 minutes
scan();
setInterval(scan, 2 * 60 * 1000);
