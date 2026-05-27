export default async function handler(req, res) {
  try {
    const endMs = Date.now();
    const startMs = endMs - (7 * 24 * 60 * 60 * 1000); // Last 7 days

    const formatDate = (ms) => new Date(ms).toISOString().replace('T', ' ').substring(0, 19);

    const payload = {
      current: 1,
      pageSize: 5000,
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
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer truenav:6b5c58f69bcabd945a420ad243d13c96'
      },
      body: JSON.stringify(payload)
    });

    const json = await response.json();

    if (json.code !== 0 || !json.data || !json.data.list) {
      console.error("External API Error:", json);
      return res.status(200).json([]); // Return empty instead of error
    }

    console.log(`✅ API Success: ${json.data.list.length} logs`);
    res.status(200).json(json.data.list);

  } catch (error) {
    console.error("API Handler Error:", error);
    res.status(200).json([]); // Fail gracefully
  }
}
