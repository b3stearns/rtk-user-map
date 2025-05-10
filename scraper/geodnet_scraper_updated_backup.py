from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException, TimeoutException, WebDriverException, ElementClickInterceptedException, StaleElementReferenceException
from datetime import datetime, timedelta
import os
import logging
import sys
import traceback
import re
import time
import json
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2 import service_account
import pickle

# Set up logging to use local Windows path
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('C:/Users/brad/rtk_user_map/rtk_user_map/data/geodnet_map.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logging.info("Starting script...")

# Google Sheets API setup
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SPREADSHEET_ID = '1E6u3Eyx_GHFpIbWGmEc6b00KoiWD0DsSSJwHZx686EA'
RANGE_NAME = 'Sheet1!A1'
PROCESSED_ROWS_FILE = 'C:/Users/brad/rtk_user_map/rtk_user_map/data/processed_rows.txt'
BATCH_SIZE = 50  # Number of rows to batch before writing to Google Sheets

def load_processed_rows():
    processed_rows = set()
    if os.path.exists(PROCESSED_ROWS_FILE):
        try:
            with open(PROCESSED_ROWS_FILE, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        processed_rows.add(line)
            logging.info(f"Loaded {len(processed_rows)} processed rows")
        except Exception as e:
            logging.error(f"Error loading processed rows: {e}")
    return processed_rows

def save_processed_row(row_id):
    try:
        with open(PROCESSED_ROWS_FILE, 'a') as f:
            f.write(f"{row_id}\n")
    except Exception as e:
        logging.error(f"Error saving processed row {row_id}: {e}")

def clean_processed_rows():
    cutoff = (datetime.now() - timedelta(days=30)).timestamp()
    processed_rows = load_processed_rows()
    cleaned_rows = set()
    for row in processed_rows:
        try:
            # Handle both old (username_timestamp) and new (username_timestamp_sessiontime) formats
            parts = row.split('_')
            if len(parts) >= 2:
                # Extract timestamp (second part, which may include spaces)
                timestamp_str = '_'.join(parts[1:-1]) if len(parts) > 2 else parts[1]
                if parse_timestamp(timestamp_str).timestamp() > cutoff:
                    cleaned_rows.add(row)
            else:
                logging.warning(f"Invalid processed row format: {row}")
        except Exception as e:
            logging.error(f"Error parsing row {row}: {e}")
            continue
    with open(PROCESSED_ROWS_FILE, 'w') as f:
        for row in cleaned_rows:
            f.write(f"{row}\n")
    logging.info(f"Cleaned processed rows, retained {len(cleaned_rows)} entries")

def calculate_sleep_time():
    now = datetime.now()
    current_hour = now.hour
    current_minute = now.minute
    current_time = now.time()
    start_time = datetime.strptime("06:00", "%H:%M").time()
    end_time = datetime.strptime("20:00", "%H:%M").time()
    if start_time <= current_time <= end_time:
        minutes_to_next_run = (30 - (current_minute % 30)) % 30
        sleep_seconds = minutes_to_next_run * 60 or 30 * 60
        logging.info(f"Between 6:00 AM and 8:00 PM - Sleeping for {sleep_seconds} seconds")
        return sleep_seconds
    else:
        minutes_to_next_run = (60 - (current_minute % 60)) % 60
        sleep_seconds = minutes_to_next_run * 60 or 60 * 60
        logging.info(f"Outside 6:00 AM to 8:00 PM - Sleeping for {sleep_seconds} seconds")
        return sleep_seconds

def get_google_sheets_service():
    try:
        credentials = service_account.Credentials.from_service_account_file(
            'C:/Users/brad/rtk_user_map/rtk_user_map/service-account-credentials.json', scopes=SCOPES)
        return build('sheets', 'v4', credentials=credentials)
    except Exception as e:
        logging.error(f"Error initializing Google Sheets service: {e}")
        raise

def append_to_google_sheet(data_batch):
    if not data_batch:
        logging.info("No data to append to Google Sheet")
        return
    for attempt in range(3):
        try:
            service = get_google_sheets_service()
            values = [[
                row.get(key, '') for key in [
                    'username', 'mountpoint', 'partner', 'ip', 'status', 'message',
                    'miner_sn', 'distance_km', 'no_of_gga', 'timestamp', 'session_time',
                    'request', 'gga', 'no_of_sp', 'no_of_dgps', 'no_of_fix', 'no_of_float',
                    'action'
                ]
            ] for row in data_batch]
            body = {'values': values}
            result = service.spreadsheets().values().append(
                spreadsheetId=SPREADSHEET_ID, range=RANGE_NAME, valueInputOption='RAW', body=body
            ).execute()
            logging.info(f"Appended {result.get('updates').get('updatedRows')} rows in batch")
            time.sleep(10)  # Increased delay to avoid rate limit
            return
        except HttpError as e:
            if attempt == 2:
                logging.error(f"Failed to append to Google Sheet after retries: {e}")
                raise
            logging.warning(f"Rate limit hit, retrying after delay... Attempt {attempt + 1}")
            time.sleep(60 * (2 ** attempt))  # Exponential backoff

def backup_sheets_data():
    try:
        service = get_google_sheets_service()
        result = service.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=RANGE_NAME).execute()
        with open(f"C:/Users/brad/rtk_user_map/rtk_user_map/data/sheets_backup_{datetime.now().strftime('%Y%m%d')}.json", 'w') as f:
            json.dump(result.get('values', []), f)
        logging.info("Backed up Google Sheets data")
    except Exception as e:
        logging.error(f"Error backing up Sheets: {e}")

def parse_nmea(gga_sentence):
    try:
        if "Ntrip-GGA: " in gga_sentence:
            gga_sentence = gga_sentence.split("Ntrip-GGA: ")[1].strip()
        parts = gga_sentence.split(",")
        if len(parts) < 10:
            logging.debug(f"Invalid GGA sentence (too few fields): {gga_sentence}")
            return None, None
        lat_str = parts[2]
        lon_str = parts[4]
        if not lat_str or not lon_str:
            logging.info(f"Empty lat/lon fields: {gga_sentence}")
            return None, None
        if lat_str in ['0000.0000', '0.0000', '0.0', '0'] or lon_str in ['00000.0000', '0000.0000', '0.0000', '0.0', '0']:
            logging.info(f"Zero lat/lon (no fix): {gga_sentence}")
            return None, None
        lat = float(lat_str) / 100
        lon = float(lon_str) / 100
        lat = int(lat) + (lat % 1) * 100 / 60
        lon = int(lon) + (lon % 1) * 100 / 60
        if parts[3] == "S":
            lat = -lat
        if parts[5] == "W":
            lon = -lon
        return lat, lon
    except Exception as e:
        logging.error(f"Error parsing NMEA: {e} - Sentence: {gga_sentence}")
        return None, None

def parse_timestamp(timestamp_str):
    try:
        return datetime.strptime(timestamp_str, "%Y/%m/%d %H:%M:%S")
    except ValueError as e:
        logging.warning(f"Error parsing timestamp '{timestamp_str}': {e}")
        return datetime.now()

def main():
    try:
        # Ensure the data directory exists
        os.makedirs('C:/Users/brad/rtk_user_map/rtk_user_map/data', exist_ok=True)

        chromedriver_path = os.getenv('CHROMEDRIVER_PATH', 'C:/Users/brad/rtk_user_map/rtk_user_map/chromedriver.exe')
        if not os.path.exists(chromedriver_path):
            logging.error(f"ChromeDriver not found at {chromedriver_path}")
            sys.exit(1)
        logging.info(f"ChromeDriver found at {chromedriver_path}")

        service = Service(chromedriver_path)
        options = webdriver.ChromeOptions()
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--headless')
        options.add_argument('--disable-gpu')
        driver = webdriver.Chrome(service=service, options=options)

        clean_processed_rows()

        try:
            while True:
                start_time = time.time()
                rows_scraped = 0
                processed_rows = load_processed_rows()
                found_duplicate = False
                data_batch = []

                # Backup Sheets data daily at midnight
                if datetime.now().hour == 0 and datetime.now().minute < 30:
                    backup_sheets_data()

                driver.get("https://rtk.geodnet.com/enterprise/login")
                logging.info("Navigating to login page...")
                
                # Handle modal dialog if present
                try:
                    modal = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.CLASS_NAME, "arco-modal"))
                    )
                    accept_button = modal.find_element(By.CSS_SELECTOR, "button.arco-btn-primary")
                    driver.execute_script("arguments[0].click();", accept_button)
                    logging.info("Modal dismissed.")
                except TimeoutException:
                    logging.info("No modal detected.")
                except Exception as e:
                    logging.warning(f"Error handling modal: {e}")

                # Wait for login form elements
                username_field = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='text']"))
                )
                logging.info("Username field found.")
                password_field = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']"))
                )
                login_button = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "button[type='submit']"))
                )
                username_field.send_keys("truenav")
                password_field.send_keys("geodnet2024")
                login_button.click()
                logging.info("Logging in...")
                WebDriverWait(driver, 10).until(EC.url_contains("rtk"))

                driver.get("https://rtk.geodnet.com/enterprise/rtk/log")
                logging.info("Navigating to log page...")
                page_number = 1
                max_pages = 50

                while page_number <= max_pages:
                    logging.info(f"Scraping page {page_number}...")
                    table = WebDriverWait(driver, 15).until(
                        EC.presence_of_element_located((By.TAG_NAME, "table"))
                    )
                    logging.info("Log table found.")
                    rows = table.find_elements(By.TAG_NAME, "tr")
                    logging.info(f"Found {len(rows)} rows on page {page_number}.")

                    for row in rows[1:]:
                        for attempt in range(3):
                            try:
                                cols = row.find_elements(By.TAG_NAME, "td")
                                if len(cols) >= 18:  # Adjusted for new column count
                                    miner_sn = cols[6].text
                                    # Skip rows with empty miner_sn
                                    if not miner_sn:
                                        logging.info(f"Skipping row: Empty Miner SN - Row Data: {[col.text for col in cols]}")
                                        break
                                    # Use session time (cols[10]) as a fallback for row_id uniqueness
                                    timestamp = cols[9].text  # Sign in time (GPS Time)
                                    session_time = cols[10].text  # Session time(s)
                                    # Check if timestamp matches expected format (YYYY/MM/DD HH:MM:SS)
                                    row_data = [col.text for col in cols]  # Store row data to avoid stale elements
                                    if not re.match(r'^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}$', timestamp):
                                        logging.warning(f"Invalid timestamp format '{timestamp}' in row - Row Data: {row_data}")
                                        timestamp = datetime.now().strftime('%Y/%m/%d %H:%M:%S')
                                    # Include session_time in row_id to ensure uniqueness
                                    row_id = f"{cols[0].text}_{timestamp}_{session_time}"
                                    if row_id in processed_rows:
                                        logging.info(f"Duplicate row found (ID: {row_id})")
                                        found_duplicate = True
                                        break
                                    session = {
                                        'username': cols[0].text,
                                        'mountpoint': cols[1].text,
                                        'partner': cols[2].text,
                                        'ip': cols[3].text,
                                        'status': cols[4].text,
                                        'message': cols[5].text,
                                        'miner_sn': miner_sn,
                                        'distance_km': cols[7].text,
                                        'no_of_gga': '1' if cols[12].text else '0',  # Count non-empty GGA
                                        'timestamp': cols[9].text,
                                        'session_time': cols[10].text,
                                        'request': cols[11].text,
                                        'gga': cols[12].text,
                                        'no_of_sp': cols[13].text if len(cols) > 13 else '0',
                                        'no_of_dgps': cols[14].text if len(cols) > 14 else '0',
                                        'no_of_fix': cols[15].text if len(cols) > 15 else '0',
                                        'no_of_float': cols[16].text if len(cols) > 16 else '0',
                                        'action': cols[17].text if len(cols) > 17 else ''
                                    }
                                    logging.info(f"Scraped GGA for row ID {row_id}: {session['gga']}")
                                    logging.info(f"Scraped timestamp for row ID {row_id}: {session['timestamp']}")
                                    # Validate GGA data
                                    if session['gga']:
                                        lat, lon = parse_nmea(session['gga'])
                                        if lat is None or lon is None:
                                            logging.warning(f"Invalid GGA data for row ID {row_id}: {session['gga']}")
                                            session['gga'] = ''  # Clear invalid GGA data
                                    data_batch.append(session)
                                    processed_rows.add(row_id)
                                    save_processed_row(row_id)
                                    rows_scraped += 1

                                    # Write in batches
                                    if len(data_batch) >= BATCH_SIZE:
                                        append_to_google_sheet(data_batch)
                                        data_batch = []
                                break
                            except StaleElementReferenceException:
                                if attempt == 2:
                                    logging.error("Failed to process row after retries")
                                    break
                                logging.warning("Stale element detected, retrying...")
                                time.sleep(1)  # Increased delay
                                # Re-fetch the table and rows
                                table = WebDriverWait(driver, 15).until(
                                    EC.presence_of_element_located((By.TAG_NAME, "table"))
                                )
                                rows = table.find_elements(By.TAG_NAME, "tr")
                                break
                        if found_duplicate:
                            break
                    if found_duplicate:
                        break

                    try:
                        next_arrow = WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CLASS_NAME, "arco-pagination-item-next"))
                        )
                        if "arco-pagination-item-disabled" in next_arrow.get_attribute("class"):
                            logging.info("Next arrow disabled. Finished scraping.")
                            break
                        try:
                            modal = WebDriverWait(driver, 2).until(
                                EC.presence_of_element_located((By.CLASS_NAME, "arco-modal-wrapper"))
                            )
                            driver.execute_script("arguments[0].remove();", modal)
                            logging.info("Modal dismissed via JavaScript.")
                        except TimeoutException:
                            logging.info("No modal detected.")
                        WebDriverWait(driver, 10).until(
                            EC.element_to_be_clickable((By.CLASS_NAME, "arco-pagination-item-next"))
                        )
                        driver.execute_script("arguments[0].click();", next_arrow)
                        logging.info(f"Navigating to page {page_number + 1}...")
                        page_number += 1
                    except (NoSuchElementException, TimeoutException):
                        logging.info("No 'Next' arrow found. Finished scraping.")
                        break

                # Write any remaining rows in the batch
                if data_batch:
                    append_to_google_sheet(data_batch)

                logging.info(f"Scraped {rows_scraped} rows in {time.time() - start_time:.2f} seconds")
                sleep_seconds = calculate_sleep_time()
                time.sleep(sleep_seconds)

        finally:
            driver.quit()

    except WebDriverException as e:
        logging.error(f"WebDriver error: {e}")
        logging.error(traceback.format_exc())
        sys.exit(1)
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
        logging.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    try:
        logging.info(f"Running script at {datetime.now()}")
        main()
    except Exception as e:
        logging.error(f"Error in script: {e}")
        logging.error(traceback.format_exc())
        sys.exit(1)