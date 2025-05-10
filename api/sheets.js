// pages/api/sheets.js
const { google } = require('googleapis');
const nmea = require('nmea-simple');

export default async function handler(req, res) {
    try {
        // Authenticate with Google Sheets API
        const auth = new google.auth.GoogleAuth({
            keyFile: './path-to-your-service-account-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = '1E6u3Eyx_GHFpIbWGmEc6b00KoiWD0DsSSJwHZx686EA';
        const range = 'Sheet1!A1:S';

        // Fetch data from Google Sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.status(200).json([]);
        }

        // Extract headers and data rows
        const headers = rows[0];
        const dataRows = rows.slice(1);

        // Map rows to objects with parsed NMEA data
        const mappedRows = dataRows.map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = row[index] || '';
            });

            // Parse the "Latest nmea" column (index 13)
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

        res.status(200).json(mappedRows);
    } catch (error) {
        console.error('Error fetching data from Google Sheet:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
}