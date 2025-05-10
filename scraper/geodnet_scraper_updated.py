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

# Set up logging to use container path
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/data/geodnet_map.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logging.info("Starting script...")

# Google Sheets API setup
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SPREADSHEET_ID = '1E6u3Eyx_GHFpIbWGmEc6b00KoiWD0DsSSJwHZx686EA'
RANGE_NAME = 'Sheet1!A1'
PROCESSED_ROWS_FILE = '/app/data/processed_rows.txt'
BATCH_SIZE = 10  # Reduced to avoid rate limits

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
            # row_id format: username_ip_station_timestamp_page
            parts = row.split('_')
            if len(parts) >= 5:
                # Extract timestamp (second-to-last part)
                timestamp_str = parts[-2]  # e.g., '2025/05/10 04:22:33'
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
            '/app/service-account-credentials.json', scopes=SCOPES)
        return build('sheets', 'v4', credentials=credentials)
    except Exception as e:
        logging.error(f"Error initializing Google Sheets service: {e}")
        raise

def clear_sheet():
    try:
        service = get_google_sheets_service()
        service.spreadsheets().values().clear(
            spreadsheetId=SPREADSHEET_ID,
            range='Sheet1'
        ).execute()
        logging.info("Cleared Google Sheet")
    except HttpError as e:
        logging.error(f"Failed to clear Google Sheet: {e}")
        raise

def write_headers_to_sheet(headers):
    try:
        service = get_google_sheets_service()
        result = service.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=RANGE_NAME).execute()
        values = result.get('values', [])
        if not values:
            # Only write headers if the sheet is empty
            body = {'values': [headers]}
            service.spreadsheets().values().update(
                spreadsheetId=SPREADSHEET_ID, range=RANGE_NAME, valueInputOption='RAW', body=body
            ).execute()
            logging.info(f"Headers written to Google Sheet: {headers}")
        else:
            logging.info("Headers already exist in Google Sheet, skipping write.")
    except HttpError as e:
        logging.error(f"Failed to write headers to Google Sheet: {e}")
        raise

def append_to_google_sheet(data_batch, headers):
    if not data_batch:
        logging.info("No data to append to Google Sheet")
        return
    for attempt in range(3):
        try:
            service = get_google_sheets_service()
            write_headers_to_sheet(headers)
            values = []
            for row in data_batch:
                row_values = [value if value is not None else '' for value in row]
                values.append(row_values)
                logging.info(f"Appending row to sheet: {row_values}")
            body = {'values': values}
            result = service.spreadsheets().values().append(
                spreadsheetId=SPREADSHEET_ID, range=RANGE_NAME, valueInputOption='RAW', body=body
            ).execute()
            logging.info(f"Appended {result.get('updates').get('updatedRows')} rows in batch")
            time.sleep(60)  # Increased delay to avoid rate limits
            return
        except HttpError as e:
            if attempt == 2:
                logging.error(f"Failed to append to Google Sheet after retries: {e}")
                raise
            logging.warning(f"Rate limit hit, retrying after delay... Attempt {attempt + 1}")
            time.sleep(60 * (2 ** attempt))

def backup_sheets_data():
    try:
        service = get_google_sheets_service()
        result = service.spreadsheets().values().get(spreadsheetId=SPREADSHEET_ID, range=RANGE_NAME).execute()
        with open(f"/app/data/sheets_backup_{datetime.now().strftime('%Y%m%d')}.json", 'w') as f:
            json.dump(result.get('values', []), f)
        logging.info("Backed up Google Sheets data")
    except Exception as e:
        logging.error(f"Error backing up Sheets: {e}")

def parse_timestamp(timestamp_str):
    try:
        return datetime.strptime(timestamp_str, "%Y/%m/%d %H:%M:%S")
    except ValueError as e:
        logging.warning(f"Error parsing timestamp '{timestamp_str}': {e}")
        return datetime.now()

def login(driver):
    for attempt in range(3):
        try:
            driver.get("https://rtk.geodnet.com/enterprise/login")
            logging.info("Navigating to login page...")

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
            return True
        except (StaleElementReferenceException, TimeoutException) as e:
            if attempt == 2:
                logging.error(f"Failed to login after retries: {e}")
                return False
            logging.warning(f"Login attempt {attempt + 1} failed, retrying... Error: {e}")
            time.sleep(2)
    return False

def main():
    try:
        os.makedirs('/app/data', exist_ok=True)

        chromedriver_path = '/usr/bin/chromedriver'
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

        # Clear the sheet only once at the start of the script
        clear_sheet()

        try:
            while True:
                start_time = time.time()
                rows_scraped = 0
                processed_rows = load_processed_rows()
                data_batch = []
                unique_rows = set()  # Track unique rows to detect webpage duplicates

                if datetime.now().hour == 0 and datetime.now().minute < 30:
                    backup_sheets_data()

                if not login(driver):
                    logging.error("Login failed, exiting...")
                    break

                driver.get("https://rtk.geodnet.com/enterprise/rtk/log")
                logging.info("Navigating to log page...")
                page_number = 1
                max_pages = 50

                # Get the table headers from the webpage
                table = WebDriverWait(driver, 30).until(
                    EC.presence_of_element_located((By.TAG_NAME, "table"))
                )
                header_row = table.find_element(By.TAG_NAME, "thead").find_element(By.TAG_NAME, "tr")
                headers = [th.text for th in header_row.find_elements(By.TAG_NAME, "th")]
                logging.info(f"Scraped table headers: {headers}")

                while page_number <= max_pages:
                    logging.info(f"Scraping page {page_number}...")
                    table = WebDriverWait(driver, 30).until(
                        EC.presence_of_element_located((By.TAG_NAME, "table"))
                    )
                    logging.info("Log table found.")
                    rows = table.find_elements(By.TAG_NAME, "tr")
                    logging.info(f"Found {len(rows)} rows on page {page_number}.")

                    # Get the first row's data to compare later for page change
                    initial_first_row = None
                    if rows and len(rows) > 1:
                        first_row_cols = rows[1].find_elements(By.TAG_NAME, "td")
                        initial_first_row = tuple(col.text for col in first_row_cols)
                        logging.info(f"Initial first row on page {page_number}: {initial_first_row}")

                    # Get the current active page number
                    try:
                        active_page_elem = WebDriverWait(driver, 5).until(
                            EC.presence_of_element_located((By.CLASS_NAME, "arco-pagination-item-active"))
                        )
                        current_active_page = active_page_elem.text
                        logging.info(f"Current active page number: {current_active_page}")
                    except (NoSuchElementException, TimeoutException) as e:
                        logging.warning(f"Could not determine current active page number: {str(e)}")
                        current_active_page = str(page_number)

                    # Process all rows on the page
                    for row in rows[1:]:
                        for attempt in range(3):
                            try:
                                cols = row.find_elements(By.TAG_NAME, "td")
                                row_data = [col.text for col in cols]
                                logging.info(f"Raw row data: {row_data}")

                                # Ensure row has enough columns
                                if len(row_data) != len(headers):
                                    logging.warning(f"Row has mismatched columns ({len(row_data)}) compared to headers ({len(headers)}): {row_data}")
                                    break

                                # Create a unique row_id using username, ip, station, timestamp, and page number
                                username = row_data[0] if len(row_data) > 0 else ''
                                ip = row_data[3] if len(row_data) > 3 else ''
                                station = row_data[6] if len(row_data) > 6 else ''
                                timestamp = row_data[9] if len(row_data) > 9 else datetime.now().strftime('%Y/%m/%d %H:%M:%S')
                                row_id = f"{username}_{ip}_{station}_{timestamp}_{page_number}"
                                if row_id in processed_rows:
                                    logging.info(f"Duplicate row found (ID: {row_id})")
                                    break

                                # Track unique rows to detect webpage duplicates
                                row_tuple = tuple(row_data)
                                unique_rows.add(row_tuple)

                                data_batch.append(row_data)
                                processed_rows.add(row_id)
                                save_processed_row(row_id)
                                rows_scraped += 1

                                break
                            except StaleElementReferenceException:
                                if attempt == 2:
                                    logging.error("Failed to process row after retries")
                                    break
                                logging.warning("Stale element detected, retrying...")
                                time.sleep(1)
                                table = WebDriverWait(driver, 30).until(
                                    EC.presence_of_element_located((By.TAG_NAME, "table"))
                                )
                                rows = table.find_elements(By.TAG_NAME, "tr")
                                break

                    logging.info(f"Processed {rows_scraped} rows total so far on page {page_number}.")

                    # Append all collected rows in batches
                    while len(data_batch) >= BATCH_SIZE:
                        batch_to_append = data_batch[:BATCH_SIZE]
                        append_to_google_sheet(batch_to_append, headers)
                        data_batch = data_batch[BATCH_SIZE:]

                    # Attempt to move to the next page with retries
                    for attempt in range(3):
                        try:
                            # Scroll to the pagination controls to ensure the Next button is in view
                            pagination = WebDriverWait(driver, 10).until(
                                EC.presence_of_element_located((By.CLASS_NAME, "arco-pagination"))
                            )
                            driver.execute_script("arguments[0].scrollIntoView(true);", pagination)
                            logging.info("Scrolled to pagination controls.")

                            # Find the Next button (span element with class arco-pagination-item-next)
                            next_arrow = WebDriverWait(driver, 10).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, "span.arco-pagination-item-next"))
                            )
                            next_arrow_classes = next_arrow.get_attribute("class")
                            logging.info(f"Next button classes: {next_arrow_classes}")
                            if "arco-pagination-item-disabled" in next_arrow_classes:
                                logging.info("Next button is disabled. Finished scraping.")
                                page_number = max_pages + 1
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
                                EC.element_to_be_clickable((By.CSS_SELECTOR, "span.arco-pagination-item-next"))
                            )
                            next_arrow.click()  # Use native click instead of execute_script
                            logging.info(f"Clicked Next button to navigate to page {page_number + 1}...")

                            # Wait for the table to update and verify the page has changed
                            WebDriverWait(driver, 5).until(
                                EC.presence_of_element_located((By.TAG_NAME, "table"))
                            )
                            table = WebDriverWait(driver, 5).until(
                                EC.presence_of_element_located((By.TAG_NAME, "table"))
                            )
                            rows = table.find_elements(By.TAG_NAME, "tr")
                            logging.info(f"Table updated, found {len(rows)} rows after clicking Next.")

                            # Log the first row after clicking Next
                            new_first_row = None
                            if rows and len(rows) > 1:
                                first_row_cols = rows[1].find_elements(By.TAG_NAME, "td")
                                new_first_row = tuple(col.text for col in first_row_cols)
                                logging.info(f"New first row on page {page_number + 1}: {new_first_row}")

                            # Verify the page has changed by checking the active page number
                            try:
                                active_page_elem = WebDriverWait(driver, 5).until(
                                    EC.presence_of_element_located((By.CLASS_NAME, "arco-pagination-item-active"))
                                )
                                new_active_page = active_page_elem.text
                                logging.info(f"New active page number: {new_active_page}")
                                if new_active_page == current_active_page:
                                    # Fallback: Check if the table rows have changed
                                    if initial_first_row and new_first_row and initial_first_row == new_first_row:
                                        logging.warning(f"Active page number did not change (still {current_active_page}) and table rows did not change. Assuming end of pagination.")
                                        page_number = max_pages + 1
                                        break
                                    else:
                                        logging.info("Active page number did not change, but table rows have updated. Continuing to next page.")
                            except (NoSuchElementException, TimeoutException) as e:
                                logging.warning(f"Could not determine new active page number: {str(e)}")
                                # Fallback: Check if the table rows have changed
                                if initial_first_row and new_first_row and initial_first_row == new_first_row:
                                    logging.warning("Table rows did not change after clicking Next button. Assuming end of pagination.")
                                    page_number = max_pages + 1
                                    break
                                else:
                                    logging.info("Could not determine new active page number, but table rows have updated. Continuing to next page.")

                            logging.info(f"Successfully navigated to page {page_number + 1}.")
                            page_number += 1
                            break  # Successfully moved to the next page
                        except (NoSuchElementException, TimeoutException, StaleElementReferenceException) as e:
                            if attempt == 2:
                                logging.info(f"Failed to navigate to next page after retries: {str(e)} (Traceback: {traceback.format_exc()}). Finished scraping.")
                                page_number = max_pages + 1
                                break
                            logging.warning(f"Failed to navigate to next page, retrying... Attempt {attempt + 1}: {str(e)} (Traceback: {traceback.format_exc()})")
                            time.sleep(2)

                # Append any remaining rows
                if data_batch:
                    append_to_google_sheet(data_batch, headers)

                logging.info(f"Scraped {rows_scraped} rows in {time.time() - start_time:.2f} seconds")
                logging.info(f"Total unique rows scraped: {len(unique_rows)}")
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