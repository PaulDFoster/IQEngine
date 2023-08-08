import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, Polygon, FeatureGroup, Circle } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import axios from 'axios';
import haversine from 'haversine-distance';

interface Track {
  id: number;
  name: string;
  description: string;
  positions: [number, number][];
  coverageAreas: number[];
}

const MapComponent: React.FC = () => {
  const defaultPosition: [number, number] = [51.505, -0.09]; // Default map position
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    axios
      .get('/api/datasources/query', {
        params: {
          account: 'rfdx4rp5',
          container: 'kleos-data',
          min_datetime: '2023-04-11T02:20:00Z',
          max_datetime: '2023-04-13T02:21:00Z',
        },
      })
      .then((response) => {
        const averageDistance = 7.19 * 1000;
        const earthRadius = 6371; // in km
        const beamwidth = 40; // in degrees
        const beamwidthRadians = beamwidth * (Math.PI / 180); // convert to radians

        const data = response.data.map((datum: any, index: number) => {
          let lastCoordinate: any = null;
          const filteredCoordinates = datum.global['iqengine:geotrack'].coordinates.filter((coordinate: any) => {
            if (coordinate[0] === 0 && coordinate[1] === 0) {
              return false;
            }

            if (lastCoordinate == null || haversine(lastCoordinate, coordinate) <= averageDistance) {
              lastCoordinate = coordinate;
              return true;
            }
            return false;
          });

          // Adding calculation of coverage area for each point
          const coverageAreas = filteredCoordinates.map((coordinate: any) => {
            const altitude = coordinate[2] / 1000; // Assuming altitude in 'iqengine:geotrack' is in meters, converting to km

            // Calculate distance to horizon and coverage area
            //const distanceToHorizon = Math.sqrt(Math.pow(altitude + earthRadius, 2) - Math.pow(earthRadius, 2));
            //const coverageArea = 2 * Math.PI * earthRadius * distanceToHorizon;

            // Calculate coverage area using beamwidth
            const radius = altitude * Math.tan(beamwidthRadians / 2);
            const coverageArea = Math.PI * Math.pow(radius, 2);

            return coverageArea;
          });

          return {
            id: index,
            name: `${datum.global['traceability:origin'].account}/${datum.global['traceability:origin'].container}`,
            description: datum.global['core:description'],
            positions: filteredCoordinates.map((coordinate: any) => [coordinate[1], coordinate[0]]),
            coverageAreas: coverageAreas,
          };
        });
        setTracks(data);
      })
      .catch((error) => console.error('Error fetching track data:', error));
  }, []);

  return (
    // circles per point for coverage area
    <MapContainer center={defaultPosition} zoom={4} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
      />
      <FeatureGroup>
        <EditControl
          position="topright"
          onEdited={console.log}
          onCreated={console.log}
          onDeleted={console.log}
          draw={{
            rectangle: false,
            circle: false,
            circlemarker: false,
            marker: false,
            polygon: false,
          }}
        />
        {tracks.map((track: Track) => (
          <>
            <Polyline key={track.id} positions={track.positions} color="red">
              <Popup>{track.description}</Popup>
            </Polyline>
            {/* {track.positions.map((position, index) => {
              // Calculate radius from area
              const area = track.coverageAreas[index]; // in square kilometers
              const radius = Math.sqrt(area / Math.PI) * 1000; // convert to meters
              return <Circle key={index} center={position} radius={radius} color="green" fillOpacity={0.1} />;
            })} */}
          </>
        ))}
      </FeatureGroup>
    </MapContainer>
  );
};

export default MapComponent;
