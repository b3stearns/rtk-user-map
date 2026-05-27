export default async function handler(req, res) {
  try {
    const endMs = Date.now();
    const startMs = endMs - (365 * 24 * 60 * 60 * 1000);

    const formatDate = (ms) => new Date(ms).toISOString().replace('T', ' ').substring(0, 19);

    const payload = {
      current: 1,
      pageSize: 20000, 
      username: "",
      mountpoint: "",
      partner: "",
      times: [formatDate(startMs), formatDate(endMs)],
      userCaseSensitive: true,
      mountCaseSensitive: true,
      start: startMs,
      end: endMs
    };

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

    if (json.code !== 0 || !json.data || !json.data.list) {
      console.error("API Error:", json);
      return res.status(500).json({ error: 'Failed to fetch or authenticate' });
    }

    const cleanMapData = json.data.list.map(log => ({
      id: log._id,
      username: log.username,
      station: log.station,
      lat: log.lat,
      lng: log.lng,
      status: log.status,
      loginTime: new Date(log.loginTime).toISOString(),
      distance: log.distance,
      request: log.request,       
      partner: log.partner,       
      ip: log.ip,                 
      duration: log.duration,     
      totalGGA: log.totalGGA,     
      msg: log.msg,
      // NEW FIELDS FOR THE SUMMARY:
      avgAge: log.avgAge,
      maxAge: log.maxAge,
      ggaStats: log.ggaStats
    }));

    res.status(200).json(cleanMapData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
