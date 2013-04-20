<?php
$snapshot = $_GET['snapshot'];
$fips = $_GET['fips'];
if ($snapshot == 'ocean') {
	$url = 'http://www.csc.noaa.gov/dataservices/Snapshot/OceanJobs?StateCountyFIPS=' . $fips;
} else if ($snapshot == 'flood') {
	$url = 'http://www.csc.noaa.gov/dataservices/Snapshot/FloodData?StateCountyFIPS=' . $fips;
} else if ($snapshot == 'wetlands') {
	$url = 'http://www.csc.noaa.gov/dataservices/Snapshot/WetlandsBenefits?StateCountyFIPS=' . $fips;
} else {
	//
}

$header[] = "Content-type: text/xml";

$ch = curl_init( $url ); 
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_HTTPHEADER, $header);

$response = curl_exec($ch);     
$response_headers = curl_getinfo($ch);     

if (curl_errno($ch)) {
	print curl_error($ch);
} else {
	curl_close($ch);
	header( 'Content-type: text/xml');
	print $response;
}
?>