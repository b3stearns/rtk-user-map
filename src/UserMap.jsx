// src/UserMap.jsx
const hardwareIcons = {
  'NTRIP GNSSInternetRadio': '/FJDDevice.png',
  'Cloudbase': '/JohnDeereDevice.png',
  'CNHiNTRIP': '/CNHIndustrialDevice.png',
  'NtripClientiOS': '/iosdevice.png',
  'HGPS': '/OutbackDevice.png',
  'Trimble': '/trimbleagdevice.png',
  'LefebureAndroid': '/trimbleagdevice.png',
  'TopCon': '/TopconDevice.png',
  'DJI': '/DJIDevice.png',
  'unknown': '/default.png'
};

const hardwareDisplayNames = {
  'NTRIP GNSSInternetRadio': 'FJD',
  'Cloudbase': 'John Deere',
  'CNHiNTRIP': 'CNH',
  'NtripClientiOS': 'iOS',
  'HGPS': 'Outback',
  'Trimble': 'Trimble',
  'LefebureAndroid': 'Trimble',
  'TopCon': 'TopCon',
  'DJI': 'DJI',
  'unknown': 'RTK Device'
};

const baseStationsData = [
  // Your existing base stations remain here
  { miner_sn: '5C013B96FB65', name: 'Haak_Trent', longitude: -96.578474, latitude: 43.857376 },
  { miner_sn: 'A0B7651FCFB1', name: 'Hurley_Canton', longitude: -96.700797, latitude: 43.288162 },
  // ... (keep all your base stations)
];

const UserMap = () => {
  const [clientStations, setClientStations] = React.useState([]);
  const [baseStations] = React.useState(baseStationsData);
  const [filteredClientStations, setFilteredClientStations] = React.useState([]);
  const [leafletMap, setLeafletMap] = React.useState(null);
  const [hardwareFilter, setHardwareFilter] = React.useState('');
  const [usernameFilter, setUsernameFilter] = React.useState('');
  const [basemap, setBasemap] = React.useState('osm');
  const mapRef = React.useRef(null);

  const fetchClientData = () => {
    console.log('Fetching client data from Coverage API...');
    fetch('/api/sheets')
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .then(result => {
        console.log(`Fetched ${result.count} stations from Coverage API`);
        const stations = result.data || [];
        
        const parsedStations = stations.map(station => ({
          username: station.username || station.name || 'Unknown',
          miner_sn: station.miner_sn,
          latitude: station.latitude,
          longitude: station.longitude,
          status: station.status || 'online',
          distance_km: station.distance_km || 0,
          hardware: 'unknown' // Coverage API doesn't have hardware type like logs
        })).filter(s => s.latitude && s.longitude);

        setClientStations(parsedStations);
        setFilteredClientStations(parsedStations);
      })
      .catch(error => {
        console.error('Error loading client data:', error);
        setClientStations([]);
        setFilteredClientStations([]);
      });
  };

  React.useEffect(() => {
    fetchClientData();
    const interval = setInterval(fetchClientData, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Filter logic (simplified)
  React.useEffect(() => {
    let filtered = [...clientStations];
    
    if (hardwareFilter) {
      filtered = filtered.filter(s => s.hardware === hardwareFilter);
    }
    if (usernameFilter) {
      filtered = filtered.filter(s => 
        s.username.toLowerCase().includes(usernameFilter.toLowerCase())
      );
    }
    
    setFilteredClientStations(filtered);
  }, [clientStations, hardwareFilter, usernameFilter]);

  // Rest of your map rendering code stays mostly the same...
  // (Leaflet setup, markers, etc.)

  return (
    <div className="map-container">
      {/* Your existing UI controls and Leaflet map */}
      {/* ... */}
    </div>
  );
};

export default UserMap;
