<?php
 require_once '../config.php';
 $mysqli = new mysqli($host,$user,$pass,$name);

/* check connection */
if ($mysqli->connect_errno) {
	printf("Connect failed: %s\n", $mysqli->connect_error);
	exit();
}
	
/* jan,21,2018,4:00:00 */
$date = date("M,d,Y,G:i:s");
$datetime = date("Y-m-d H:i:s");
	
if (isset($_POST['action'])) {
		
	switch ($_POST['action']) {
	
		case "reset":
			$query = sprintf("UPDATE counters SET datetime='%s' WHERE name='%s'",$datetime,$_POST['counter']);
				
			if ($mysqli->query($query) == TRUE)
			{
				echo "<b>Counter Reset</b>";
			}
				
			break;
	
		case "delete":
			$query = sprintf("DELETE FROM counters WHERE name='%s'",$_POST['counter']);
				
			if ($mysqli->query($query) == TRUE)
			{
				echo "<b>Counter Deleted</b>";
			}
				
			break;
	
		case "create":
			$query = sprintf("INSERT INTO counters (name, description, datetime) VALUE ('%s', '%s', '%s')",$_POST['name'],$_POST['description'],$datetime);
				
			if ($mysqli->query($query) == TRUE)
			{
				echo "<b>Counter Created</b>";
			}
				
			break;
	}
		
}
?>

<!doctype html>
<html lang="en">
<head>
	<title>Reset Counters</title>
</head>

<body>

	<h1>Coutdown Board Admin</h1>

	<h2>Modify Existing</h2>

	<form action="/admin/index.php" method="post">
	
	<table>
		<tr><th>Name</th><th>Description</th><th>Date</th></tr>

		<?php
		$query = "SELECT * FROM counters";

		if ($result = $mysqli->query($query)) {

			while ($row = $result->fetch_assoc()) {
				printf ("<tr><td><input type=\"radio\" name=\"counter\" value=\"%s\">%s</td><td>%s</td><td>%s</td></tr>",$row["name"],$row["name"],$row["description"],$row["datetime"]);
			}
		}
	
		$mysqli->close();
		?>
	</table>

	<input type="submit" name="action" value="reset">
	<input type="submit" name="action" value="delete">

	</form>

	<h2>Create New</h2>

	<form action="/admin/index.php" method="post">
	
	<table>
		<tr><td>Name</td><td><input name="name" type="text"></td></tr>
		<tr><td>Description</td><td><input name="description" type="text" size="75"></td></tr>
	</table>
	
	<input type="submit" name="action" value="create">
	</form>

</body>
</html>
