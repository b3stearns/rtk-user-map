// src/UserMap.js
const { useState, useEffect, useRef } = window.React;

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

const displayToRequestMap = {
  'FJD': ['NTRIP GNSSInternetRadio'],
  'John Deere': ['Cloudbase'],
  'CNH': ['CNHiNTRIP'],
  'iOS': ['NtripClientiOS'],
  'Outback': ['HGPS'],
  'Trimble': ['Trimble', 'LefebureAndroid'],
  'TopCon': ['TopCon'],
  'DJI': ['DJI'],
  'RTK Device': ['unknown']
};

const baseStationsData = [
  { miner_sn: '5C013B96FB65', name: 'Haak_Trent', longitude: -96.578474, latitude: 43.857376 },
  { miner_sn: 'A0B7651FCFB1', name: 'Hurley_Canton', longitude: -96.700797, latitude: 43.288162 },
  { miner_sn: 'A0B7651F0045', name: 'Abrahamson_Fulton', longitude: -97.89423, latitude: 43.776585 },
  { miner_sn: 'AC1518EFD575', name: 'Strom_Kimball', longitude: -98.966006, latitude: 43.877161 },
  { miner_sn: 'C05D89AE4C99', name: 'Dykstra_chancellor', longitude: -96.969014, latitude: 43.445431 },
  { miner_sn: 'AC1518F00CA5', name: 'Hall_Ree', longitude: -99.200847, latitude: 44.51925 },
  { miner_sn: 'A0B7651E3231', name: 'Smit_Chancellor', longitude: -97.033168, latitude: 43.35944 },
  { miner_sn: 'A0B7651FC8C1', name: 'BSB', longitude: -96.728137, latitude: 43.445443 },
  { miner_sn: 'C05D898D7039', name: 'Knips_Sturgis', longitude: -103.658751, latitude: 44.386065 },
  { miner_sn: 'A0B7651D9AD5', name: 'Lakner_wessington', longitude: -98.699386, latitude: 44.510189 },
  { miner_sn: 'A0B7651E44ED', name: 'vzw', longitude: -96.587749, latitude: 44.236195 },
  { miner_sn: 'A0B7651F4AB1', name: 'Diedrich', longitude: -96.624732, latitude: 44.216034 },
  { miner_sn: 'A0B7651EFC6D', name: 'abrahamson_lake', longitude: -97.492925, latitude: 44.206926 },
  { miner_sn: 'A0B7651E5569', name: 'Wollmann', longitude: -97.109361, latitude: 44.016185 },
  { miner_sn: '24DCC3E2068D', name: 'stearns_madison', longitude: -97.087042, latitude: 44.022505 },
  { miner_sn: '24DCC3E29A91', name: '605', longitude: -96.719998, latitude: 43.608711 },
  { miner_sn: 'C82E1891CE49', name: 'Geigle_Pierre', longitude: -100.26422, latitude: 44.411344 },
  { miner_sn: '24DCC3E20BC9', name: 'Rymerson_Toronto', longitude: -96.688754, latitude: 44.580949 },
  { miner_sn: '24DCC3E29DF1', name: 'Fort', longitude: -99.454851, latitude: 44.078739 },
  { miner_sn: '24DCC3E29BDD', name: 'Stearns', longitude: -98.219428, latitude: 44.318177 },
  { miner_sn: '24DCC3E2A8C1', name: 'Lebahn', longitude: -96.72563, latitude: 43.826611 },
  { miner_sn: '24DCC3E29C81', name: 'Pam-Alcester', longitude: -96.677742, latitude: 42.932756 },
  { miner_sn: '24DCC3E2A7B1', name: 'MKW', longitude: -96.594023, latitude: 43.582344 },
  { miner_sn: '24DCC3E14631', name: 'Blaine', longitude: -96.943917, latitude: 43.614942 },
  { miner_sn: '24DCC3E29BFD', name: 'Brown', longitude: -96.844792, latitude: 43.834571 },
  { miner_sn: '24DCC3E2A8FD', name: '605', longitude: -96.804023, latitude: 43.329748 },
  { miner_sn: '30C922A65A9D', name: 'Baumberger', longitude: -96.9917, latitude: 43.971786 },
  { miner_sn: '30C922A652C1', name: 'Eickelschulte', longitude: -96.745936, latitude: 43.695566 },
  { miner_sn: '30C922A665C5', name: 'Bohner', longitude: -96.844825, latitude: 43.440283 },
  { miner_sn: '30C922A64DC5', name: '605 Real Estate', longitude: -96.768736, latitude: 43.499546 },
  { miner_sn: 'A842E3B1C36D', name: 'Stearns-Home', longitude: -96.736969, latitude: 43.479829 }
];

function parseNMEA(nmea) {
  if (!nmea || typeof nmea !== 'string') {
    console.warn('Invalid NMEA data:', nmea);
    return { lat: null, lon: null };
  }
  try {
    if (nmea.includes("Ntrip-GGA: ")) {
      nmea = nmea.split("Ntrip-GGA: ")[1].trim();
    }
    const parts = nmea.split(',');
    if (parts.length < 10) {
      console.warn('Invalid NMEA sentence, too few fields:', nmea);
      return { lat: null, lon: null };
    }
    const latStr = parts[2];
    const latDir = parts[3];
    const lonStr = parts[4];
    const lonDir = parts[5];
    if (!latStr || !lonStr || latStr === '0' || lonStr === '0') {
      console.warn('Empty or zero lat/lon fields:', nmea);
      return { lat: null, lon: null };
    }
    let lat = parseFloat(latStr) / 100;
    let lon = parseFloat(lonStr) / 100;
    lat = Math.floor(lat) + (lat % 1) * 100 / 60;
    lon = Math.floor(lon) + (lon % 1) * 100 / 60;
    if (latDir === 'S') lat = -lat;
    if (lonDir === 'W') lon = -lon;
    if (isNaN(lat) || isNaN(lon)) {
      console.warn('Parsed NaN coordinates:', nmea);
      return { lat: null, lon: null };
    }
    return { lat, lon };
  } catch (error) {
    console.error('Error parsing NMEA data:', error, 'NMEA:', nmea);
    return { lat: null, lon: null };
  }
}

function parseHardware(request) {
  console.log('Parsing hardware for request:', request);
  try {
    const lowerRequest = request.toLowerCase();
    if (lowerRequest.includes('ntrip gnssinternetradio')) return 'NTRIP GNSSInternetRadio';
    if (lowerRequest.includes('cloudbase')) return 'Cloudbase';
    if (lowerRequest.includes('cnhintrip')) return 'CNHiNTRIP';
    if (lowerRequest.includes('ntripclientios')) return 'NtripClientiOS';
    if (lowerRequest.includes('hgps')) return 'HGPS';
    if (lowerRequest.includes('trimble')) return 'Trimble';
    if (lowerRequest.includes('lefebureandroid')) return 'LefebureAndroid';
    if (lowerRequest.includes('topcon')) return 'TopCon';
    if (lowerRequest.includes('dji')) return 'DJI';
    console.log('Detected hardware: unknown');
    return 'unknown';
  } catch (error) {
    console.error('Error parsing hardware:', error, request);
    return 'unknown';
  }
}

function convertToCST(utcTime) {
  try {
    if (!utcTime) {
      console.warn('Invalid UTC time:', utcTime);
      return null;
    }
    const formattedTime = utcTime.replace(/\//g, '-');
    const date = new Date(formattedTime + ' UTC');
    if (isNaN(date.getTime())) {
      console.warn('Invalid date created from UTC time:', utcTime);
      return null;
    }
    const cstOffset = -6 * 60; // CST is UTC-6
    const utcOffset = date.getTimezoneOffset();
    const cstTime = new Date(date.getTime() + (cstOffset - utcOffset) * 60 * 1000);
    return cstTime;
  } catch (error) {
    console.error('Error converting to CST:', error, utcTime);
    return null;
  }
}

function secondsToMinutes(seconds) {
  try {
    const minutes = Math.round(parseFloat(seconds) / 60);
    return isNaN(minutes) ? 'N/A' : minutes;
  } catch (error) {
    console.error('Error converting seconds to minutes:', error, seconds);
    return 'N/A';
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  } catch (error) {
    console.error('Error calculating distance:', error, { lat1, lon1, lat2, lon2 });
    return Infinity;
  }
}

const UserMap = () => {
  const [clientStations, setClientStations] = useState([]);
  const [baseStations] = useState(baseStationsData);
  const [filteredClientStations, setFilteredClientStations] = useState([]);
  const [leafletMap, setLeafletMap] = useState(null);
  const [timeFilter, setTimeFilter] = useState('1d'); // Default to 1 day (24 hours)
  const [hardwareFilter, setHardwareFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [connectionLine, setConnectionLine] = useState(null);
  const [basemap, setBasemap] = useState('osm');
  const mapRef = useRef(null);

  const fetchClientData = () => {
    console.log('Fetching client data from API route...');
    fetch('/api/sheets')
      .then(response => {
        console.log('API Response Status:', response.status);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json();
      })
      .then(result => {
        console.log('API Response:', result);
        if (result.error) throw new Error(result.error);
        const data = result.data;
        console.log('Full API Data:', data);
        console.log('First few rows of data:', data.slice(0, 5));
        if (data.length > 0) {
          console.log('Keys in first row:', Object.keys(data[0]));
        }
        if (!data || data.length === 0) {
          console.warn('No client data found');
          setClientStations([]);
          setFilteredClientStations([]);
          return;
        }
        const parsedStations = data.map(station => {
          console.log('Raw station data:', station);
          const nmeaResult = parseNMEA(station['latest_nmea'] || '');
          return {
            username: station['username'] || '',
            mountpoint: station['mountpoint'] || '',
            partner: station['partner'] || '',
            ip: station['ip'] || '',
            status: station['status'] || '',
            message: station['message'] || '',
            station: station['station'] || '',
            distance_km: station['distance(km)'] || '',
            no_of_gga: station['no. of gga'] || '',
            sign_in_time: station['sign in time (gps time)'] || '',
            session_time_s: station['session_time(s)'] || '',
            rtk_fix_rate: station['rtk_fix_rate(%)'] || '',
            request: station['request'] || '',
            latest_nmea: station['latest_nmea'] || '',
            no_of_sp: station['no. of sp'] || '',
            no_of_dgps: station['no. of dgps'] || '',
            no_of_fix: station['no. of fix'] || '',
            no_of_float: station['no. of float'] || '',
            operations: station['operations'] || '',
            lat: nmeaResult.lat,
            lon: nmeaResult.lon,
            hardware: parseHardware(station['request'] || '')
          };
        });
        console.log('Parsed Client Stations:', parsedStations);
        const groupedByUser = {};
        parsedStations.forEach(station => {
          if (!groupedByUser[station.username]) {
            groupedByUser[station.username] = [];
          }
          groupedByUser[station.username].push(station);
        });

        const deduplicatedStations = [];
        Object.keys(groupedByUser).forEach(username => {
          const userStations = groupedByUser[username];
          const processed = new Set();
          userStations.forEach((station, index) => {
            if (processed.has(index)) return;
            if (!station.lat || !station.lon) {
              console.warn(`Skipping station ${station.username}: Invalid coordinates (lat: ${station.lat}, lon: ${station.lon})`);
              return;
            }
            const stationDate = new Date(station.sign_in_time);
            const nearby = [station];
            processed.add(index);
            for (let j = index + 1; j < userStations.length; j++) {
              if (processed.has(j)) continue;
              const otherStation = userStations[j];
              if (!otherStation.lat || !otherStation.lon) continue;
              const distance = calculateDistance(station.lat, station.lon, otherStation.lat, otherStation.lon);
              if (distance <= 1) {
                nearby.push(otherStation);
                processed.add(j);
              }
            }
            nearby.sort((a, b) => new Date(b.sign_in_time) - new Date(a.sign_in_time));
            deduplicatedStations.push(nearby[0]);
          });
        });

        console.log('Deduplicated Client Stations:', deduplicatedStations);
        setClientStations(deduplicatedStations);
        setFilteredClientStations(deduplicatedStations);
      })
      .catch(error => {
        console.error('Error loading client data from API:', error);
        setClientStations([]);
        setFilteredClientStations([]);
      });
  };

  useEffect(() => {
    console.log('Fetching client data on mount...');
    fetchClientData();
    const interval = setInterval(() => {
      fetchClientData();
    }, 3600 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    console.log('Applying filters...', { timeFilter, hardwareFilter, usernameFilter });
    let filtered = clientStations;
    
    if (timeFilter) {
      const now = new Date();
      const nowCST = convertToCST(now.toISOString().replace('T', ' ').substring(0, 19));
      if (!nowCST) {
        console.error('Failed to convert current time to CST');
        return;
      }
      const hours = { '1d': 24, '2d': 48, '7d': 168 }[timeFilter];
      filtered = filtered.filter(station => {
        try {
          if (!station.sign_in_time) {
            console.warn(`Sign-in time is undefined for station: ${station.username}`);
            return false;
          }
          const signInCST = convertToCST(station.sign_in_time);
          if (!signInCST) {
            console.warn(`Invalid sign-in time for station: ${station.username}, time: ${station.sign_in_time}`);
            return false;
          }
          const timeDiffHours = Math.abs(nowCST - signInCST) / (1000 * 60 * 60);
          const isWithinTime = timeDiffHours <= hours;
          console.log(`Filtering station by time: ${station.username}, Sign-in (CST): ${signInCST.toISOString()}, Time difference (hours): ${timeDiffHours.toFixed(2)}, Within ${hours}h: ${isWithinTime}`);
          return isWithinTime;
        } catch (error) {
          console.error('Error filtering station by time:', error, station);
          return false;
        }
      });
    }

    if (hardwareFilter) {
      filtered = filtered.filter(station => {
        try {
          const selectedDisplayName = Object.keys(displayToRequestMap).find(displayName => 
            displayToRequestMap[displayName].includes(hardwareFilter)
          );
          const requestTerms = displayToRequestMap[selectedDisplayName] || [hardwareFilter];
          const matchesHardware = requestTerms.includes(station.hardware);
          console.log(`Filtering station by hardware: ${station.username}, Hardware: ${station.hardware}, Matches ${hardwareFilter}: ${matchesHardware}`);
          return matchesHardware;
        } catch (error) {
          console.error('Error filtering station by hardware:', error, station);
          return false;
        }
      });
    }

    if (usernameFilter) {
      filtered = filtered.filter(station => {
        try {
          const matchesUsername = station.username === usernameFilter;
          console.log(`Filtering station by username: ${station.username}, Matches ${usernameFilter}: ${matchesUsername}`);
          return matchesUsername;
        } catch (error) {
          console.error('Error filtering station by username:', error, station);
          return false;
        }
      });
    }

    console.log('Filtered Client Stations:', filtered);
    setFilteredClientStations(filtered);
  }, [clientStations, timeFilter, hardwareFilter, usernameFilter]);

  useEffect(() => {
    if (!mapRef.current) return;

    console.log('Initializing map...');
    try {
      const mapInstance = L.map(mapRef.current).setView([0, 0], 2);

      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });

      osmLayer.addTo(mapInstance);

      const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Satellite": satelliteLayer
      };
      L.control.layers(baseMaps).addTo(mapInstance);

      if (basemap === 'osm') {
        mapInstance.addLayer(osmLayer);
        mapInstance.removeLayer(satelliteLayer);
      } else {
        mapInstance.addLayer(satelliteLayer);
        mapInstance.removeLayer(osmLayer);
      }

      const legend = L.control({ position: 'bottomright' });
      legend.onAdd = function () {
        console.log('Adding legend...');
        try {
          const div = L.DomUtil.create('div', 'leaflet-control-legend');
          div.innerHTML = `
            <div class="legend-item">
              <div style="background-color: #0000FF; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px;"></div>
              <span>Base Station</span>
            </div>
            <div class="legend-item">
              <img src="/JohnDeereDevice.png" alt="John Deere" onerror="this.style.display='none'; console.error('Failed to load John Deere icon');">
              <span>John Deere Device</span>
            </div>
            <div class="legend-item">
              <img src="/iosdevice.png" alt="iPhone" onerror="this.style.display='none'; console.error('Failed to load iPhone icon');">
              <span>iPhone Device</span>
            </div>
            <div class="legend-item">
              <img src="/default.png" alt="Unknown" onerror="this.style.display='none'; console.error('Failed to load Unknown icon');">
              <span>Unknown Hardware</span>
            </div>
          `;
          return div;
        } catch (error) {
          console.error('Error adding legend:', error);
          const div = L.DomUtil.create('div', 'leaflet-control-legend');
          div.innerHTML = `
            <div class="legend-item">
              <div style="background-color: #0000FF; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px;"></div>
              <span>Base Station</span>
            </div>
            <div class="legend-item">
              <span>John Deere Device</span>
            </div>
            <div class="legend-item">
              <span>iPhone Device</span>
            </div>
            <div class="legend-item">
              <span>Unknown Hardware</span>
            </div>
          `;
          return div;
        }
      };
      legend.addTo(mapInstance);

      const logoControl = L.control({ position: 'bottomleft' });
      logoControl.onAdd = function () {
        console.log('Adding Geodnet logo...');
        try {
          const div = L.DomUtil.create('div', 'leaflet-control-logo');
          div.innerHTML = `
            <img src="/GeodnetLogo.png" alt="Geodnet Logo" onerror="this.style.display='none'; console.error('Failed to load GeodnetLogo.png');">
          `;
          return div;
        } catch (error) {
          console.error('Error adding Geodnet logo:', error);
          const div = L.DomUtil.create('div', 'leaflet-control-logo');
          div.innerHTML = '<span>Geodnet Logo</span>';
          return div;
        }
      };
      logoControl.addTo(mapInstance);

      setLeafletMap(mapInstance);

      return () => {
        console.log('Removing map...');
        try {
          mapInstance.remove();
        } catch (error) {
          console.error('Error removing map:', error);
        }
      };
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }, [basemap]);

  useEffect(() => {
    if (leafletMap && (filteredClientStations.length || baseStations.length)) {
      const allPoints = [
        ...filteredClientStations.map(s => {
          console.log('Client point for bounds:', { username: s.username, lat: s.lat, lon: s.lon });
          return [s.lat, s.lon];
        }),
        ...baseStations.map(s => {
          console.log('Base point for bounds:', { name: s.name, lat: s.latitude, lon: s.longitude });
          return [s.latitude, s.longitude];
        })
      ];
      console.log('All Points for Bounds:', allPoints);
      if (allPoints.length > 0) {
        try {
          leafletMap.fitBounds(allPoints);
        } catch (error) {
          console.error('Error fitting map bounds:', error);
        }
      } else {
        console.warn('No points to fit bounds.');
      }
    } else {
      console.log('Map not ready or no stations to display:', { leafletMap, filteredClientStationsLength: filteredClientStations.length, baseStationsLength: baseStations.length });
    }
  }, [leafletMap, filteredClientStations]);

  useEffect(() => {
    if (!leafletMap) return;

    console.log('Creating client markers...');
    const clientMarkers = L.layerGroup();
    const now = new Date();
    filteredClientStations.forEach(s => {
      try {
        if (!s.lat || !s.lon || isNaN(s.lat) || isNaN(s.lon)) {
          console.warn(`Skipping marker for station ${s.username}: Invalid coordinates (lat: ${s.lat}, lon: ${s.lon})`);
          return;
        }
        console.log('Adding client marker:', s);
        const signIn = convertToCST(s.sign_in_time);
        const isRecent = signIn && ((now - signIn) / (1000 * 60 * 60)) <= 12;
        const iconUrl = hardwareIcons[s.hardware] || hardwareIcons['unknown'];
        console.log('Using icon URL for client marker:', iconUrl);

        const iconWidth = 35;
        const iconHeight = 35;

        const marker = L.marker([s.lat, s.lon], {
          icon: L.divIcon({
            className: isRecent ? 'recent-marker-glow' : '',
            html: `<div style="background-image: url('${iconUrl}'); width: ${iconWidth}px; height: ${iconHeight}px; background-size: cover;" onerror="console.error('Failed to load icon for marker:', '${iconUrl}');"></div>`,
            iconSize: [iconWidth, iconHeight],
            iconAnchor: [iconWidth / 2, iconHeight / 2]
          })
        });

        const connectedTimeCST = convertToCST(s.sign_in_time)?.toISOString().replace('T', ' ').substring(0, 19) || 'N/A';
        const connectionMinutes = secondsToMinutes(s.session_time_s);

        marker.bindPopup(`
          <div>
            <strong>Username:</strong> ${s.username}<br>
            <strong>Mountpoint:</strong> ${s.mountpoint}<br>
            <strong>IP:</strong> ${s.ip}<br>
            <strong>Status:</strong> ${s.status}<br>
            <strong>Message:</strong> ${s.message}<br>
            <strong>Station:</strong> ${s.station}<br>
            <strong>Connected Time (CST):</strong> ${connectedTimeCST}<br>
            <strong>Connection Duration (min):</strong> ${connectionMinutes}<br>
            <strong>Request:</strong> ${s.request}<br>
            <strong>Latest NMEA:</strong> ${s.latest_nmea}<br>
            <strong>Hardware:</strong> ${s.hardware}
          </div>
        `);

        marker.on('popupopen', () => {
          console.log('Popup opened for marker:', s.station);
          try {
            if (connectionLine) {
              console.log('Removing existing connection line');
              leafletMap.removeLayer(connectionLine);
              setConnectionLine(null);
            }

            const baseStation = baseStations.find(bs => bs.miner_sn === s.station);
            if (baseStation) {
              console.log('Base station found:', baseStation);
              const line = L.polyline([
                [s.lat, s.lon],
                [baseStation.latitude, baseStation.longitude]
              ], {
                color: 'red',
                weight: 2,
                opacity: 0.8
              }).addTo(leafletMap);
              setConnectionLine(line);
              console.log('Connection line added');
            } else {
              console.log('Base station not found for station:', s.station);
            }
          } catch (error) {
            console.error('Error drawing connection line:', error);
          }
        });

        marker.on('popupclose', () => {
          console.log('Popup closed for marker:', s.station);
          try {
            if (connectionLine) {
              console.log('Removing connection line on popup close');
              leafletMap.removeLayer(connectionLine);
              setConnectionLine(null);
            }
          } catch (error) {
            console.error('Error removing connection line:', error);
          }
        });

        clientMarkers.addLayer(marker);
        console.log('Client marker added:', { username: s.username, lat: s.lat, lon: s.lon });
      } catch (error) {
        console.error('Error adding client marker:', error, s);
      }
    });

    console.log('Creating base markers...');
    const baseMarkers = L.layerGroup();
    baseStations.forEach(s => {
      try {
        console.log('Adding base marker:', s);
        const marker = L.marker([s.latitude, s.longitude], {
          icon: L.divIcon({
            className: 'base-station-marker',
            html: '<div style="background-color: #0000FF; width: 10px; height: 10px; border-radius: 50%;"></div>',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
          })
        });
        const minerSNLast4 = s.miner_sn.slice(-4);
        marker.bindPopup(`
          <div>
            <strong>Station ID:</strong> ${minerSNLast4}<br>
            <strong>Name:</strong> ${s.name}<br>
            <strong>Latitude:</strong> ${s.latitude}<br>
            <strong>Longitude:</strong> ${s.longitude}
          </div>
        `);
        baseMarkers.addLayer(marker);
        console.log('Base marker added:', { name: s.name, lat: s.latitude, lon: s.longitude });
      } catch (error) {
        console.error('Error adding base marker:', error, s);
      }
    });

    console.log('Clearing existing layers...');
    try {
      leafletMap.eachLayer(layer => {
        if (layer instanceof L.LayerGroup) {
          leafletMap.removeLayer(layer);
        }
      });
      console.log('Adding client markers to map...');
      leafletMap.addLayer(clientMarkers);
      console.log('Adding base markers to map...');
      leafletMap.addLayer(baseMarkers);
      console.log('Base Markers Added:', baseStations.length);
    } catch (error) {
      console.error('Error adding layers to map:', error);
    }
  }, [leafletMap, filteredClientStations]);

  const branding = React.createElement(
    'div',
    { className: 'branding' },
    React.createElement('img', { src: 'truenav-logo.png', alt: 'TrueNav Logo', onError: () => console.error('Failed to load truenav-logo.png') })
  );

  const header = React.createElement(
    'div',
    { className: 'flex flex-row items-center p-4 bg-white border-b border-gray-200 shadow-sm h-16' },
    branding,
    React.createElement(
      'select',
      { 
        id: 'time-filter',
        value: timeFilter, 
        onChange: e => setTimeFilter(e.target.value),
        className: 'p-2 mr-4 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 flex-1 max-w-[200px]'
      },
      React.createElement('option', { value: '1d' }, '1 Day'),
      React.createElement('option', { value: '2d' }, '2 Days'),
      React.createElement('option', { value: '7d' }, '7 Days')
    ),
    React.createElement(
      'select',
      { 
        id: 'hardware-filter',
        value: hardwareFilter, 
        onChange: e => setHardwareFilter(e.target.value),
        className: 'p-2 mr-4 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 flex-1 max-w-[200px]'
      },
      React.createElement('option', { value: '' }, 'All Hardware'),
      Object.keys(displayToRequestMap).map(displayName => 
        React.createElement('option', { key: displayName, value: displayToRequestMap[displayName][0] }, displayName)
      )
    ),
    React.createElement(
      'input',
      { 
        id: 'username-filter',
        type: 'text',
        placeholder: 'Exact Username',
        value: usernameFilter,
        onChange: e => setUsernameFilter(e.target.value),
        className: 'p-2 mr-4 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 flex-1 max-w-[200px]'
      }
    ),
    React.createElement(
      'select',
      { 
        id: 'basemap-filter',
        value: basemap, 
        onChange: e => setBasemap(e.target.value),
        className: 'p-2 mr-4 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 flex-1 max-w-[200px]'
      },
      React.createElement('option', { value: 'osm' }, 'OpenStreetMap'),
      React.createElement('option', { value: 'satellite' }, 'Satellite')
    )
  );

  const mapContainer = React.createElement(
    'div',
    { id: 'map', ref: mapRef },
    null
  );

  const container = React.createElement(
    'div',
    { className: 'container' },
    header,
    mapContainer
  );

  return container;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(UserMap));