<?php

	// Configuração do formulário de contacto
	$destino    = 'contacto@antoniadecoracao.com';
	$nomeSite   = 'Antônia Decoração';
	$emailSite  = 'noreply@antoniadecoracao.com';

	$name    = isset($_POST['name'])    ? trim($_POST['name'])    : '';
	$email   = isset($_POST['email'])   ? trim($_POST['email'])   : '';
	$mensagem= isset($_POST['message']) ? trim($_POST['message']) : '';

	if($_SERVER['REQUEST_METHOD'] !== 'POST') {
		http_response_code(405);
		exit;
	}

	if($name === '' || $email === '' || $mensagem === '') {
		http_response_code(400);
		echo json_encode(array(
			'sendstatus' => 0,
			'message'     => '<div class="alert alert-danger"><strong>Erro:</strong> Preencha todos os campos.</div>'
		));
		exit;
	}

	if(!filter_var($email, FILTER_VALIDATE_EMAIL)) {
		http_response_code(400);
		echo json_encode(array(
			'sendstatus' => 0,
			'message'     => '<div class="alert alert-danger"><strong>Erro:</strong> Email inválido.</div>'
		));
		exit;
	}

	// Protecção contra header injection
	foreach(array($name, $email) as $campo) {
		if(strpos($campo, "\r") !== false || strpos($campo, "\n") !== false) {
			http_response_code(400);
			echo json_encode(array(
				'sendstatus' => 0,
				'message'     => '<div class="alert alert-danger"><strong>Erro:</strong> Dados inválidos.</div>'
			));
			exit;
		}
	}

	$mensagem = strip_tags($mensagem);

	$corpo = "Nome: $name\n"
	       . "Email: $email\n\n"
	       . "Mensagem:\n$mensagem\n";

	$headers = "From: $emailSite\r\n"
	         . "Reply-To: $email\r\n"
	         . "Content-Type: text/plain; charset=UTF-8\r\n";

	$enviado = @mail($destino, "Novo contacto pelo site - $nomeSite", $corpo, $headers);

	if($enviado) {
		echo json_encode(array(
			'sendstatus' => 1,
			'message'     => '<div class="alert alert-success"><strong>Sucesso!</strong> A sua mensagem foi enviada. Entraremos em contacto em breve.</div>'
		));
	} else {
		echo json_encode(array(
			'sendstatus' => 0,
			'message'     => '<div class="alert alert-danger"><strong>Erro:</strong> Não foi possível enviar a mensagem. Tente o telefone +244 933 354 976.</div>'
		));
	}

?>
