<!doctype html>
<html lang="en">
<head>
        <title>Setup</title>
</head>

<body>

<?php
 require_once '../config.php';
 $mysqli = new mysqli($host,$user,$pass,$name);

/* check connection */
if ($mysqli->connect_errno) {
	printf("Connect failed: %s\n", $mysqli->connect_error);
	exit();
}

$sql = "CREATE TABLE IF NOT EXISTS 'counters' (
  'name' varchar(50) DEFAULT NULL,
  'description' varchar(50) DEFAULT NULL,
  'datetime' datetime DEFAULT NULL,
  'id' int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY ('id')
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=latin1";

if ($mysqli->query($query) == TRUE)
{
    echo "Database Created";
}
else
{
    echo "Error";
}
	
?>

</body>
</html>
