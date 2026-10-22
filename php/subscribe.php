<?php

	// MailChimp
	$APIKey = getenv('MAILCHIMP_API_KEY');
	$listID = getenv('MAILCHIMP_LIST_ID');

	if (!$APIKey || !$listID) {
		echo json_encode(array(
			'sendstatus' => 0,
			'message' => '<div class="alert alert-danger subscription-error" role="alert"><strong>Error:</strong> Subscription service is not configured.</div>'
		));
		exit;
	}

	$email   = $_POST['email'];

	require_once('inc/MCAPI.class.php');

	$api = new MCAPI($APIKey);
	$list_id = $listID;

	if($api->listSubscribe($list_id, $email) === true) {
		$sendstatus = 1;
		$message = '<div class="alert alert-success subscription-success" role="alert"><strong>Success!</strong> Check your email to confirm sign up.</div>';
	} else {
		$sendstatus = 0;
		$message = '<div class="alert alert-danger subscription-error" role="alert"><strong>Error:</strong> ' . $api->errorMessage.'</div>';
	}

	$result = array(
		'sendstatus' => $sendstatus,
		'message' => $message
	);

	echo json_encode($result);

?>