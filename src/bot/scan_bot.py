import requests
import time
from datetime import datetime

TELEGRAM_BOT_TOKEN = "8148338157:AAFsiUOy9sJ9eTseiq8h_pbVamyp9wniE0s"
TELEGRAM_CHAT_ID = "819307069"

COINDCX_API_BASE = "https://api.coindcx.com/exchange/v1"
TIMEFRAMES = ["5m", "15m", "30m", "1h"]

def timeframe_to_minutes(tf):
    if tf == "5m":
        return 5
    elif tf == "15m":
        return 15
    elif tf == "30m":
        return 30
    elif tf == "1h":
        return 60
    else:
        return 5

def fetch_all_pairs():
    try:
        response = requests.get(f"{COINDCX_API_BASE}/markets")
        response.raise_for_status()
        data = response.json()
        # The API returns a list, so iterate over list elements
        if isinstance(data, list):
            pairs = [m['market'] for m in data if m['base_currency'] != "USDT" and m['quote_currency'] == "USDT"]
        elif isinstance(data, dict):
            pairs = [key for key, m in data.items() if m['base_currency'] != "USDT" and m['quote_currency'] == "USDT"]
        else:
            pairs = []
        return pairs
    except Exception as e:
        print(f"Error fetching pairs: {e}")
        return []

def fetch_ohlcv(pair, timeframe):
    try:
        interval = timeframe_to_minutes(timeframe)
        url = f"https://public.coindcx.com/market_data/candles?pair={pair}&interval={interval}"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        ohlcv = []
        for candle in data:
            ohlcv.append({
                "timestamp": candle[0],
                "open": float(candle[1]),
                "high": float(candle[2]),
                "low": float(candle[3]),
                "close": float(candle[4]),
                "volume": float(candle[5]),
            })
        return ohlcv
    except Exception as e:
        print(f"Error fetching OHLCV for {pair} {timeframe}: {e}")
        return []

def calculate_ema(data, period):
    k = 2 / (period + 1)
    ema_array = []
    ema = data[0]
    ema_array.append(ema)
    for price in data[1:]:
        ema = price * k + ema * (1 - k)
        ema_array.append(ema)
    return ema_array

def is_body_near_ema(candle, ema, threshold_percent=0.15):
    body_low = min(candle["open"], candle["close"])
    body_high = max(candle["open"], candle["close"])
    threshold = ema * (threshold_percent / 100)
    return (body_low <= ema + threshold) and (body_high >= ema - threshold)

def is_green_candle(candle):
    return candle["close"] > candle["open"]

def check_pattern(ohlcv, ema9, ema15, ema50, ema200, index):
    if index < 0 or index >= len(ohlcv):
        return False
    candle = ohlcv[index]
    if not is_green_candle(candle):
        return False

    near9 = is_body_near_ema(candle, ema9[index])
    near15 = is_body_near_ema(candle, ema15[index])
    near50 = is_body_near_ema(candle, ema50[index])
    near200 = is_body_near_ema(candle, ema200[index])

    near9and15 = near9 and near15
    near9_15_50 = near9 and near15 and near50

    price_touched_200 = (abs(candle["low"] - ema200[index]) <= ema200[index] * 0.15 / 100) or \
                        (abs(candle["high"] - ema200[index]) <= ema200[index] * 0.15 / 100)
    body_not_near_200 = not near200

    if (price_touched_200 and body_not_near_200 and near9and15) or near9_15_50:
        return True
    return False

def send_telegram_alert(message):
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "Markdown"
        }
        response = requests.post(url, json=payload)
        response.raise_for_status()
        print(f"Alert sent successfully: {message}")
    except Exception as e:
        print(f"Error sending Telegram alert: {e}")

def scan():
    print(f"Starting scan at {datetime.utcnow().isoformat()}Z")
    
    # Send initial test message only once when the bot starts (moved to main)
    # send_telegram_alert("Bot started and scanning for patterns! 🤖")
    
    pairs = fetch_all_pairs()
    if not pairs:
        print("No pairs found, skipping scan.")
        return

    for pair in pairs:
        for timeframe in TIMEFRAMES:
            ohlcv = fetch_ohlcv(pair, timeframe)
            if not ohlcv:
                continue
            
            # Removed frequent scanning messages to reduce Telegram spam
            # send_telegram_alert(f"Scanning {pair} on {timeframe} timeframe...")
            
            closes = [c["close"] for c in ohlcv]
            ema9 = calculate_ema(closes, 9)
            ema15 = calculate_ema(closes, 15)
            ema50 = calculate_ema(closes, 50)
            ema200 = calculate_ema(closes, 200)

            last_index = len(ohlcv) - 1
            for i in range(last_index, last_index - 4, -1):
                if i < 0:
                    break
                if check_pattern(ohlcv, ema9, ema15, ema50, ema200, i):
                    candle_time = datetime.fromtimestamp(ohlcv[i]["timestamp"] / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    message = f"🎯 Pattern detected!\nPair: {pair}\nTimeframe: {timeframe}\nTime: {candle_time}"
                    print(message)
                    send_telegram_alert(message)
                    break

    print(f"Scan completed at {datetime.utcnow().isoformat()}Z")

if __name__ == "__main__":
    # Send startup message only once when the bot starts
    send_telegram_alert("🚀 CoinDCX Scanner Bot is starting up!")
    
    while True:
        try:
            scan()
            print("Waiting 120 seconds before next scan...")
            time.sleep(120)  # Sleep for 2 minutes
