const { google } = require('googleapis');
const nmea = require('nmea-simple');

module.exports = async (req, res) => {
  console.log('Received request to /api/sheets');
  try {
    // Check for GOOGLE_CREDENTIALS environment variable
    if (!process.env.GOOGLE_CREDENTIALS) {
      console.error('GOOGLE_CREDENTIALS environment variable is not set');
      return res.status(500).json({ error: 'GOOGLE_CREDENTIALS environment variable is not set' });
    }

    console.log('Parsing Google Sheets credentials...');
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('Fetching data from Google Sheets...');
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1E6u3Eyx_GHFpIbWGmEc6b00KoiWD0DsSSJwHZx686EA';
    const range = 'Sheet1!A1:S';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('No data found in Google Sheet');
      return res.status(200).json([]);
    }

    console.log('Processing Google Sheet data...');
    // Extract headers and data rows
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Map rows to objects with parsed NMEA data
    const mappedRows = dataRows.map(row => {
      const rowData = {};
      headers.forEach((header, index) => {
        rowData[header] = row[index] || '';
      });

      // Parse the "Latest nmea" column
      const nmeaSentence = rowData['Latest nmea'] || '';
      let latitude = null;
      let longitude = null;
      if (nmeaSentence && nmeaSentence.startsWith('$GPGGA')) {
        try {
          const parsedNmea = nmea.parseNmeaSentence(nmeaSentence);
          if (parsedNmea && parsedNmea.latitude && parsedNmea.longitude) {
            latitude = parsedNmea.latitude;
            longitude = parsedNmea.longitude;
          }
        } catch (error) {
          console.error(`Failed to parse NMEA sentence: ${nmeaSentence}`, error);
        }
      }

      return {
        ...rowData,
        latitude,
        longitude,
      };
    });

    console.log('Successfully fetched and processed data:', mappedRows);
    res.status(200).json(mappedRows);
  } catch (error) {
    console.error('Error fetching data from Google Sheet:', error);
    res.status(500).json({ error: 'Failed to fetch data', details: error.message });
  }
};