import React, { useState, useEffect } from 'react';
import Amplify, { Auth } from 'aws-amplify';
import { AmplifyAuthenticator, AmplifySignOut } from '@aws-amplify/ui-react';
import { Signer } from "@aws-amplify/core";
import Location from "aws-sdk/clients/location";
import Pin from './Pin'
import useInterval from './useInterval'
import ReactMapGL, { Marker, NavigationControl } from "react-map-gl";

import "mapbox-gl/dist/mapbox-gl.css";
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import awsconfig from './aws-exports';

const mapName = "EtaDeliveryMap"; // HERE IT GOES THE NAME OF YOUR MAP
const indexName = "EtaDeliveryPlaceIndex" // HERE GOES THE NAME OF YOUR PLACE INDEX
const trackerName = "DropThePackageTracker" // HERE GOES THE NAME OF  YOUR TRACKER
const deviceID = "eta-device" // HERE IT GOES THE NAME OF YOUR DEVICE
const routeCalculator = "MyDropPackageEtaCalculator"; // HERE IT GOES THE NAME OF YOUR ROUTE CALCULATOR

Amplify.configure(awsconfig);
var AWS = require('aws-sdk');
AWS.config.update({ region: 'us-west-2' });

/**
 * Sign requests made by Mapbox GL using AWS SigV4.
 */
const transformRequest = (credentials) => (url, resourceType) => {
  // Resolve to an AWS URL
  if (resourceType === "Style" && !url?.includes("://")) {
    url = `https://maps.geo.us-west-2.amazonaws.com/maps/v0/maps/${url}/style-descriptor`;
  }

  // Only sign AWS requests (with the signature as part of the query string)
  if (url?.includes("amazonaws.com")) {
    return {
      url: Signer.signUrl(url, {
        access_key: credentials.accessKeyId,
        secret_key: credentials.secretAccessKey,
        session_token: credentials.sessionToken,
      })
    };
  }

  // Don't sign
  return { url: url || "" };
};

function Header(props) {
  return (
    <div className="container">
      <div className="row">
        <div className="col-10">
          <h2>PACKAGE DELIVERY APPLICATION</h2>
        </div>
        <div className="col-2">
          <AmplifySignOut />
        </div>
      </div>
    </div>
  )
};

function Search(props) {

  const [place, setPlace] = useState('Helsinki');

  const handleChange = (event) => {
    setPlace(event.target.value);
  }

  const handleClick = (event) => {
    event.preventDefault();
    props.searchPlace(place)
  }

  return (
    <div className="container">
      <div className="input-group">
        <input type="text" className="form-control form-control-lg" placeholder="Search for Places" aria-label="Place" aria-describedby="basic-addon2" value={place} onChange={handleChange} />
        <div className="input-group-append">
          <button onClick={handleClick} className="btn btn-primary" type="submit">Search</button>
        </div>
      </div>
    </div>
  )
};


function Track(props) {

  const handleClick = (event) => {
    event.preventDefault();
    props.trackDevice()
  }
  return (
    <div className="container">
      <div className="input-group">
        <div className="input-group-append">
          <button onClick={handleClick} className="btn btn-primary" type="submit">Track</button>
        </div>
      </div>
    </div>
  )
}

const App = () => {

  var trackingLongitude;
  var trackingLatitude;

  const [credentials, setCredentials] = useState(null);

  const [viewport, setViewport] = useState({
    longitude: -123.1187,
    latitude: 49.2819,
    zoom: 10,
  });

  const [client, setClient] = useState(null);

  const [eta, setEta] = useState(null);

  const [marker, setMarker] = useState({
    longitude: -123.1187,
    latitude: 49.2819,
  });

  const [devPosMarkers, setDevPosMarkers] = useState([]);

  useEffect(() => {
    const fetchCredentials = async () => {
      setCredentials(await Auth.currentUserCredentials());
    };

    fetchCredentials();

    const createClient = async () => {
      const credentials = await Auth.currentCredentials();
      const client = new Location({
        credentials,
        region: awsconfig.aws_project_region,
      });
      setClient(client);
    }

    createClient();
  }, []);

  useInterval(() => {
    getDevicePosition();
  }, 30000);

  const searchPlace = (place) => {

    const params = {
      IndexName: indexName,
      Text: place,
    };

    client.searchPlaceIndexForText(params, (err, data) => {
      if (err) console.error(err);
      if (data) {

        const coordinates = data.Results[0].Place.Geometry.Point;
        setViewport({
          longitude: coordinates[0],
          latitude: coordinates[1],
          zoom: 10
        });

        setMarker({
          longitude: coordinates[0],
          latitude: coordinates[1],
        })
        return coordinates;
      }
    });
  }


  const getDevicePosition = () => {

    setDevPosMarkers([]);

    var params = {
      DeviceId: deviceID,
      TrackerName: trackerName,
      StartTimeInclusive: "2021-02-02T19:05:07.327Z",
      EndTimeExclusive: new Date()
    };

    client.getDevicePositionHistory(params, (err, data) => {
      if (err) console.log(err, err.stack);
      if (data) {
        console.log(data)
        const tempPosMarkers = data.DevicePositions.map(function (devPos, index) {

          return {
            index: index,
            long: devPos.Position[0],
            lat: devPos.Position[1]
          }
        });

        setDevPosMarkers(tempPosMarkers);
        const pos = tempPosMarkers.length - 1;

        setViewport({
          longitude: tempPosMarkers[pos].long,
          latitude: tempPosMarkers[pos].lat,
          zoom: 12
        });

        trackingLongitude = tempPosMarkers[pos].long;
        trackingLatitude = tempPosMarkers[pos].lat;
        myRouteCalculator(trackingLongitude, trackingLatitude);
      }
    });
  }

  const myRouteCalculator = (long, lat) => {

    let parameter = {
      CalculatorName: routeCalculator,
      DeparturePosition: [long, lat],
      DestinationPosition: [-74.03330326080321, 40.741859668270294]
    };

    client.calculateRoute(parameter, (err, data) => {
      if (err) console.log(err);
      if (data) {
        const deliveryETA = data.Legs[0].DurationSeconds;

        const etaInMins = Math.round(deliveryETA / 60);
        setEta(etaInMins);

        if (deliveryETA < 300 && deliveryETA > 100) {

          // Create publish parameters
          var params = {
            Message: 'ETA is 5 minutes', /* required */
            TopicArn: 'arn:aws:sns:us-west-2:615450471092:EtaSNS'
          };

          var config = new AWS.Config({
            accessKeyId: 'AKIAY6S5U5K2K7I4S34U',
            secretAccessKey: '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',
            region: 'us-west-2',
            apiVersion: '2010-03-31'
          });

          // Create promise and SNS service object
          var publishTextPromise = new AWS.SNS(config).publish(params).promise();

          // Handle promise's fulfilled/rejected states
          publishTextPromise.then(
            function (data) {
              console.log(`Message ${params.Message} sent to the topic ${params.TopicArn}`);
              console.log("MessageID is " + data.MessageId);
            }).catch(
              function (err) {
                console.error(err, err.stack);
              });
        }
      }
    });
  }

  const trackerMarkers = React.useMemo(() => devPosMarkers.map(
    pos => (
      <Marker key={pos.index} longitude={pos.long} latitude={pos.lat} >
        <Pin text={pos.index + 1} size={20} />
      </Marker>
    )), [devPosMarkers]);


  return (
    <AmplifyAuthenticator>
      <div className="App">
        <Header />
        <br />
        <div>
          <Search searchPlace={searchPlace} />
        </div>
        <br />
        <div>
          {eta
            ? <div>
              <h5>My Package Delivery ETA is: {eta} mins</h5>
            </div>
            : <div></div>
          }
          <Track trackDevice={getDevicePosition} />
        </div>
        <br />
        <div>
          {credentials ? (
            <ReactMapGL
              {...viewport}
              width="100%"
              height="100vh"
              transformRequest={transformRequest(credentials)}
              mapStyle={mapName}
              onViewportChange={setViewport} w
            >
              <Marker
                longitude={marker.longitude}
                latitude={marker.latitude}
                offsetTop={-20}
                offsetLeft={-10}
              >
                <Pin size={20} />
              </Marker>

              {trackerMarkers}

              <div style={{ position: "absolute", left: 20, top: 20 }}>
                <NavigationControl showCompass={false} />
              </div>

            </ReactMapGL>
          ) : (
            <h1>Loading...</h1>
          )}
        </div>
      </div>
    </AmplifyAuthenticator>
  );
}

export default App;


