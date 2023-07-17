from azure.storage.blob import BlobServiceClient
from dateutil.parser import parse
from numpy import dot, linalg, arccos, rad2deg
import json
import numpy as np
from math import radians, cos, sin, asin, sqrt


def haversine(lon1, lat1, lon2, lat2):
    # Convert degrees to radians
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])

    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))

    # Radius of earth in kilometers. Use 3956 for miles
    r = 6371

    # Calculate the result
    return c * r


def angle_between(v1, v2):
    # Calculate the angle in degrees between vectors 'v1' and 'v2'
    cos_theta = dot(v1, v2) / (linalg.norm(v1) * linalg.norm(v2))
    return rad2deg(arccos(np.clip(cos_theta, -1, 1)))  # clip cos_theta to handle potential floating point errors


connection_str = ""
container_name = ""
angle_threshold = 30.0
time_gap_threshold = 2.0

blob_service_client = BlobServiceClient.from_connection_string(connection_str)
container_client = blob_service_client.get_container_client(container_name)

# Variables to count files with time, angle, or time gap errors
time_errors = 0
angle_errors = 0
zero_point_errors = 0
time_gap_errors = 0

# Iterate through all blobs in the container
for blob in container_client.list_blobs():
    # Process only .sigmf-meta files
    if blob.name.endswith('.sigmf-meta'):
        # Download the blob content as a string
        blob_client = blob_service_client.get_blob_client(container_name, blob.name)
        blob_content = blob_client.download_blob().readall()

        # Parse the JSON content
        json_content = json.loads(blob_content)
        captures = json_content["captures"]

        # Variables to detect errors in current file
        has_time_error = False
        has_angle_error = False
        has_zero_point_error = False
        has_time_gap_error = False

        # Iterate through the captures checking the order of the core:datetime values and time gaps
        last_datetime = None
        for capture in captures:
            current_datetime = parse(capture["core:datetime"])
            if last_datetime:
                if current_datetime < last_datetime and not has_time_error:
                    time_errors += 1
                    has_time_error = True
                elif (current_datetime - last_datetime).total_seconds() > time_gap_threshold and not has_time_gap_error:
                    time_gap_errors += 1
                    has_time_gap_error = True

            last_datetime = current_datetime

        # Check if coordinates form a straight line without sharp turns
        geotrack = json_content["global"]["iqengine:geotrack"]
        coordinates = np.array(geotrack["coordinates"])
        for i in range(len(coordinates)-2):
            v1 = coordinates[i+1] - coordinates[i]
            v2 = coordinates[i+2] - coordinates[i+1]

            if all(coordinates[i+1] == 0) and not has_zero_point_error:
                zero_point_errors += 1
                has_zero_point_error = True
            elif angle_between(v1, v2) < angle_threshold and not has_angle_error:
                angle_errors += 1
                has_angle_error = True

         # Calculate the distances between each pair of consecutive points
        distances = []
        for i in range(len(coordinates)-1):
            lon1, lat1, _ = coordinates[i]
            lon2, lat2, _ = coordinates[i+1]

            # Calculate the distance using the Haversine formula and append it to the list
            distance = haversine(lon1, lat1, lon2, lat2)
            distances.append(distance)

        # Calculate the average distance
        average_distance = sum(distances) / len(distances)

        # Exclude points that are too far from the average distance
        distances = [d for d in distances if abs(d - average_distance) <= average_distance]
       

# Print the counts of files with errors
print(f"Number of files with time errors: {time_errors}")
print(f"Number of files with angle errors: {angle_errors}")
print(f"Number of files with zero point errors: {zero_point_errors}")
print(f"Number of files with time gap errors: {time_gap_errors}")
print(f'Average distance: {average_distance}')