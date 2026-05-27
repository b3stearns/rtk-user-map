export default async function handler(req, res) {
  try {
    // 1. Dynamically calculate timestamps for the last 7 days
    const endMs = Date.now();
    const startMs = endMs - (7 * 24 * 60 * 60 * 1000);

    // Format dates to "YYYY-MM-DD HH:MM:SS" for the 'times' array
    const formatDate = (ms) => new Date(ms).toISOString().replace('T', ' ').substring(0, 19);

    // 2. Build the exact payload
    const payload = {
      current: 1,
      pageSize: 5000, // Grabs all logs at once to avoid pagination
      username: "",
      mountpoint: "",
      partner: "",
      times: [formatDate(startMs), formatDate(endMs)],
      userCaseSensitive: true,
      mountCaseSensitive: true,
      start: startMs,
      end: endMs
    };

    // 3. Fetch the data directly from Geodnet
    const response = await fetch('https://rtk.geodnet.com/api/v1/be/rtkLogs', {
      method: 'POST', 
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer truenav:6b5c58f69bcabd945a420ad243d13c96', 
        'Origin': 'https://rtk.geodnet.com',
        'Referer': 'https://rtk.geodnet.com/enterprise/rtk/log'
      },
      body: JSON.stringify(payload)
    });

    const json = await response.json();

    // Prevent errors if the API fails or token expires
    if (json.code !== 0 || !json.data || !json.data.list) {
      console.error("API Error:", json);
      return res.status(500).json({ error: 'Failed to fetch or authenticate' });
    }

    // 4. Strip out the heavy data and keep EXACTLY what index.html needs
    const cleanMapData = json.data.list.map(log => ({
      id: log._id,
      username: log.username,
      station: log.station,
      lat: log.lat,
      lng: log.lng,
      status: log.status,
      loginTime: new Date(log.loginTime).toISOString(),
      distance: log.distance,
      request: log.request,       // Needed for hardware icons
      partner: log.partner,       // Needed for Info Bar
      ip: log.ip,                 // Needed for Info Bar
      duration: log.duration,     // Needed for Info Bar
      totalGGA: log.totalGGA,     // Needed for Info Bar
      msg: log.msg                // Needed for Info Bar
    }));

    // 5. Send the clean data to your frontend map
    res.status(200).json(cleanMapData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
