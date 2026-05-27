export default async function handler(req, res) {
  try {
    console.log("🚀 API route started");

    const endMs = Date.now();
    const startMs = endMs - (7 * 24 * 60 * 60 * 1000); // Only last 7 days

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

    console.log("External API status:", response.status);

    const json = await response.json();
    console.log("External response code:", json.code);

    if (json.code !== 0 || !json.data || !json.data.list) {
      console.error("External API failed:", json);
      return res.status(500).json({ error: "External API error", details: json });
    }

    console.log(`✅ Success - ${json.data.list.length} records`);
    res.status(200).json(json.data.list);

  } catch (error) {
    console.error("Handler crashed:", error.message);
    res.status(500).json({ error: error.message });
  }
}
