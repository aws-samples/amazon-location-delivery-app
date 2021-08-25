#!/bin/bash
TRACKER_NAME=DropThePackageTracker
DEVICE_ID=eta-device
​
function update_position()
	{
		Position=$1
		CURRENT_TIME=$(date +%s)
		aws location batch-update-device-position --tracker-name $TRACKER_NAME --updates "DeviceId=${DEVICE_ID},Position=${Position},SampleTime=${CURRENT_TIME}"
	}
​
update_position "-74.053945,40.711939"; sleep 30
update_position "-74.055747,40.719095"; sleep 30
update_position "-74.053173,40.726575"; sleep 30
update_position "-74.050040,40.730803"; sleep 30
update_position "-74.044160,40.733665"; sleep 30
update_position "-74.038195,40.736982"; sleep 30
update_position "-74.033303,40.741859";