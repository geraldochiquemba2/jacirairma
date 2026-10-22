/* Painel de administracao - Antônia Decoração
   Login, categorias, imagens do carousel e produtos (com postos).
   Sem dependencias: fetch() + FileReader. */

(function () {
    'use strict';

    var API = '/api/admin/';
    var CHAVE_TOKEN = 'adminToken';

    var token = null;
    var abaAtiva = 'categorias';
    var dados = {
        categorias: [],
        carousel: [],
        produtos: []
    };

    /* ------------------------------------------------------------------
       Utilitarios
    ------------------------------------------------------------------ */

    function $(sel) {
        return document.querySelector(sel);
    }

    function $$(sel) {
        return Array.prototype.slice.call(document.querySelectorAll(sel));
    }

    function mostrar(el) {
        if (el) {
            el.hidden = false;
        }
    }

    function esconder(el) {
        if (el) {
            el.hidden = true;
        }
    }

    function escapar(texto) {
        return String(texto === undefined || texto === null ? '' : texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function guardarToken(valor) {
        token = valor;
        try {
            if (valor) {
                window.sessionStorage.setItem(CHAVE_TOKEN, valor);
            } else {
                window.sessionStorage.removeItem(CHAVE_TOKEN);
            }
        } catch (erro) {
            /* modo privado: seguimos sem guardar */
        }
    }

    function lerToken() {
        try {
            return window.sessionStorage.getItem(CHAVE_TOKEN) || '';
        } catch (erro) {
            return '';
        }
    }

    function aviso(texto, tipo) {
        var caixa = $('#admin-toasts');
        if (!caixa) {
            return;
        }
        var t = document.createElement('div');
        t.className = 'admin-toast' + (tipo === 'erro' ? ' admin-toast-erro' : '');
        var icone = document.createElement('i');
        icone.className = tipo === 'erro' ? 'ion-close-circled' : 'ion-checkmark-circled';
        var textoEl = document.createElement('span');
        textoEl.textContent = texto;
        t.appendChild(icone);
        t.appendChild(textoEl);
        caixa.appendChild(t);
        window.setTimeout(function () {
            if (t.parentNode) {
                t.parentNode.removeChild(t);
            }
        }, 4000);
    }

    function erroFormulario(seletor, mensagem) {
        var el = $(seletor);
        if (!el) {
            return;
        }
        el.textContent = mensagem;
        mostrar(el);
    }

    function limparErro(seletor) {
        var el = $(seletor);
        if (el) {
            el.textContent = '';
            esconder(el);
        }
    }

    /* ------------------------------------------------------------------
       Chamadas a API
    ------------------------------------------------------------------ */

    function chamar(metodo, caminho, corpo) {
        var opcoes = {
            method: metodo,
            headers: { 'Accept': 'application/json' }
        };

        if (corpo !== undefined && corpo !== null) {
            opcoes.headers['Content-Type'] = 'application/json';
            opcoes.body = JSON.stringify(corpo);
        }

        if (token) {
            opcoes.headers['X-Admin-Token'] = token;
        }

        return fetch(API + caminho, opcoes).then(function (resposta) {
            return resposta.text().then(function (texto) {
                var dadosResposta = {};

                if (texto) {
                    try {
                        dadosResposta = JSON.parse(texto);
                    } catch (erro) {
                        dadosResposta = { ok: false, erro: 'Resposta inválida do servidor.' };
                    }
                }

                if (resposta.status === 401) {
                    guardarToken('');
                    mostrarLogin();
                    dadosResposta.ok = false;
                    dadosResposta.erro = dadosResposta.erro || 'Sessão inválida ou expirada. Inicie sessão novamente.';
                }

                return dadosResposta;
            });
        }).catch(function () {
            return { ok: false, erro: 'Não foi possível falar com o servidor.' };
        });
    }

    /* ------------------------------------------------------------------
       Login / logout
    ------------------------------------------------------------------ */

    function mostrarLogin() {
        mostrar($('#ecra-login'));
        esconder($('#ecra-painel'));
    }

    function mostrarPainel() {
        esconder($('#ecra-login'));
        mostrar($('#ecra-painel'));
    }

    function entrar(evento) {
        if (evento) {
            evento.preventDefault();
        }

        limparErro('#login-erro');

        var login = ($('#campo-login') || {}).value || '';
        var senha = ($('#campo-senha') || {}).value || '';

        if (!login.trim() || !senha) {
            erroFormulario('#login-erro', 'Introduza o login e a senha.');
            return;
        }

        chamar('POST', 'login', { login: login.trim(), senha: senha }).then(function (resposta) {
            if (resposta.ok && resposta.token) {
                guardarToken(resposta.token);
                mostrarPainel();
                carregarTudo();
            } else {
                erroFormulario('#login-erro', resposta.erro || 'Credenciais inválidas.');
            }
        });
    }

    function sair() {
        guardarToken('');
        var campoSenha = $('#campo-senha');
        if (campoSenha) {
            campoSenha.value = '';
        }
        mostrarLogin();
    }

    /* ------------------------------------------------------------------
       Abas
    ------------------------------------------------------------------ */

    function mudarAba(nome) {
        abaAtiva = nome;

        $$('.admin-aba').forEach(function (botao) {
            var activa = botao.getAttribute('data-aba') === nome;
            botao.classList.toggle('ativa', activa);
            botao.setAttribute('aria-selected', activa ? 'true' : 'false');
        });

        $$('.admin-seccao').forEach(function (seccao) {
            if (seccao.getAttribute('data-seccao') === nome) {
                mostrar(seccao);
            } else {
                esconder(seccao);
            }
        });
    }

    /* ------------------------------------------------------------------
       Tabelas
    ------------------------------------------------------------------ */

    function celulaPosicao(item) {
        var td = document.createElement('td');
        td.className = 'admin-celula-pos';
        td.textContent = String(item.posicao || '');
        return td;
    }

    function celulaIcone(item) {
        var td = document.createElement('td');
        td.className = 'admin-celula-icone';

        var i = document.createElement('i');
        i.className = item.icone || 'ion-ios7-heart';
        td.appendChild(i);

        return td;
    }

    function celulaMiniatura(item) {
        var td = document.createElement('td');

        if (item.src) {
            var img = document.createElement('img');
            img.className = 'admin-miniatura';
            img.src = item.src;
            img.alt = item.legenda || item.nome || '';
            td.appendChild(img);
        } else {
            var vazia = document.createElement('span');
            vazia.className = 'admin-miniatura-vazia';
            vazia.textContent = 'Sem imagem';
            td.appendChild(vazia);
        }

        return td;
    }

    function celulaTexto(titulo, sub) {
        var td = document.createElement('td');
        td.className = 'admin-celula-titulo';

        var forte = document.createElement('strong');
        forte.textContent = titulo || '';
        td.appendChild(forte);

        if (sub) {
            var pequeno = document.createElement('span');
            pequeno.className = 'admin-celula-sub';
            pequeno.textContent = sub;
            td.appendChild(pequeno);
        }

        return td;
    }

    function celulaAccoes(tipo, item) {
        var td = document.createElement('td');
        td.className = 'admin-celula-acoes';

        var btnSubir = document.createElement('button');
        btnSubir.type = 'button';
        btnSubir.className = 'admin-btn admin-btn-acc';
        btnSubir.innerHTML = '<i class="ion-arrow-up-c"></i>';
        btnSubir.title = 'Subir na posição';
        btnSubir.setAttribute('aria-label', 'Subir ' + (item.nome || item.legenda || 'item'));
        btnSubir.addEventListener('click', function () {
            mover(tipo, item.id, -1);
        });

        var btnDescer = document.createElement('button');
        btnDescer.type = 'button';
        btnDescer.className = 'admin-btn admin-btn-acc';
        btnDescer.innerHTML = '<i class="ion-arrow-down-c"></i>';
        btnDescer.title = 'Descer na posição';
        btnDescer.setAttribute('aria-label', 'Descer ' + (item.nome || item.legenda || 'item'));
        btnDescer.addEventListener('click', function () {
            mover(tipo, item.id, 1);
        });

        var btnEditar = document.createElement('button');
        btnEditar.type = 'button';
        btnEditar.className = 'admin-btn admin-btn-acc';
        btnEditar.innerHTML = '<i class="ion-edit"></i>';
        btnEditar.title = 'Editar';
        btnEditar.setAttribute('aria-label', 'Editar ' + (item.nome || item.legenda || 'item'));
        btnEditar.addEventListener('click', function () {
            editar(tipo, item);
        });

        var btnApagar = document.createElement('button');
        btnApagar.type = 'button';
        btnApagar.className = 'admin-btn admin-btn-perigo';
        btnApagar.innerHTML = '<i class="ion-trash-a"></i>';
        btnApagar.title = 'Apagar';
        btnApagar.setAttribute('aria-label', 'Apagar ' + (item.nome || item.legenda || 'item'));
        btnApagar.addEventListener('click', function () {
            apagar(tipo, item);
        });

        td.appendChild(btnSubir);
        td.appendChild(btnDescer);
        td.appendChild(btnEditar);
        td.appendChild(btnApagar);

        return td;
    }

    function desenharCategorias() {
        var corpo = document.querySelector('#tabela-categorias tbody');
        if (!corpo) {
            return;
        }

        corpo.innerHTML = '';

        dados.categorias.forEach(function (item) {
            var linha = document.createElement('tr');
            linha.appendChild(celulaPosicao(item));
            linha.appendChild(celulaIcone(item));
            linha.appendChild(celulaTexto(item.nome, item.descricao));
            linha.appendChild(celulaAccoes('categorias', item));
            corpo.appendChild(linha);
        });

        esconder($('#vazio-categorias'));
        mostrar($('#vazio-categorias'));
    }

    function desenharCarousel() {
        var corpo = document.querySelector('#tabela-carousel tbody');
        if (!corpo) {
            return;
        }

        corpo.innerHTML = '';

        dados.carousel.forEach(function (item) {
            var linha = document.createElement('tr');
            linha.appendChild(celulaPosicao(item));
            linha.appendChild(celulaMiniatura(item));
            linha.appendChild(celulaTexto(item.legenda, item.telegram_file_id ? 'Telegram' : item.src));
            linha.appendChild(celulaAccoes('carousel', item));
            corpo.appendChild(linha);
        });

        mostrar($('#vazio-carousel'));
    }

    function desenharProdutos() {
        var corpo = document.querySelector('#tabela-produtos tbody');
        if (!corpo) {
            return;
        }

        corpo.innerHTML = '';

        dados.produtos.forEach(function (item) {
            var linha = document.createElement('tr');
            linha.appendChild(celulaPosicao(item));
            linha.appendChild(celulaMiniatura(item));
            linha.appendChild(celulaTexto(item.nome, [item.preco, item.categoria].filter(Boolean).join(' - ')));
            linha.appendChild(celulaAccoes('produtos', item));
            corpo.appendChild(linha);
        });

        mostrar($('#vazio-produtos'));
    }

    function desenharTudo() {
        desenharCategorias();
        desenharCarousel();
        desenharProdutos();

        $$('[data-conta]').forEach(function (elemento) {
            var tipo = elemento.getAttribute('data-conta');
            elemento.textContent = String((dados[tipo] || []).length);
        });

        var select = $('#prod-categoria');
        if (select) {
            var valor = select.value;
            select.innerHTML = '';
            var opcao = document.createElement('option');
            opcao.value = '';
            opcao.textContent = 'Sem categoria';
            select.appendChild(opcao);

            dados.categorias.forEach(function (categoria) {
                var op = document.createElement('option');
                op.value = categoria.nome;
                op.textContent = categoria.nome;
                select.appendChild(op);
            });

            select.value = valor;
        }
    }

    /* ------------------------------------------------------------------
       Carregar / guardar
    ------------------------------------------------------------------ */

    function carregarLista(tipo) {
        return chamar('GET', tipo).then(function (resposta) {
            if (resposta.ok) {
                dados[tipo] = resposta.dados || [];
            } else {
                aviso(resposta.erro || 'Não foi possível carregar os dados.', 'erro');
            }
            desenharTudo();
            return resposta;
        });
    }

    function carregarTudo() {
        return chamar('GET', 'estado').then(function (estado) {
            if (!estado.ok) {
                guardarToken('');
                mostrarLogin();
                return;
            }

            var avisoTelegram = $('#aviso-telegram');
            if (avisoTelegram) {
                if (estado.telegram && estado.telegram.configurado) {
                    esconder(avisoTelegram);
                } else {
                    mostrar(avisoTelegram);
                }
            }

            var contagens = estado.contagens || {};
            var resumo = $('#admin-resumo');
            if (resumo) {
                resumo.textContent = 'Categorias: ' + (contagens.categorias || 0) +
                    ' | Imagens: ' + (contagens.carousel || 0) +
                    ' | Produtos: ' + (contagens.produtos || 0);
            }

            return Promise.all([
                carregarLista('categorias'),
                carregarLista('carousel'),
                carregarLista('produtos')
            ]);
        });
    }

    function guardar(tipo, item) {
        return chamar('POST', tipo, item).then(function (resposta) {
            if (resposta.ok) {
                aviso('Alterações guardadas.');
                carregarLista(tipo);
            } else {
                aviso(resposta.erro || 'Não foi possível guardar.', 'erro');
            }
            return resposta;
        });
    }

    function apagar(tipo, item) {
        var nome = item.nome || item.legenda || 'este item';
        if (!window.confirm('Apagar "' + nome + '"?')) {
            return;
        }

        chamar('DELETE', tipo + '?id=' + encodeURIComponent(item.id)).then(function (resposta) {
            if (resposta.ok) {
                aviso('Item apagado.');
                carregarLista(tipo);
            } else {
                aviso(resposta.erro || 'Não foi possível apagar.', 'erro');
            }
        });
    }

    function mover(tipo, id, direccao) {
        var lista = dados[tipo] || [];
        var indice = -1;

        for (var i = 0; i < lista.length; i++) {
            if (lista[i].id === id) {
                indice = i;
                break;
            }
        }

        if (indice === -1) {
            return;
        }

        var destino = indice + direccao;
        if (destino < 0 || destino >= lista.length) {
            return;
        }

        var copia = lista.slice();
        var item = copia.splice(indice, 1)[0];
        copia.splice(destino, 0, item);

        var ordem = copia.map(function (elemento) {
            return elemento.id;
        });

        chamar('POST', 'ordem', { tipo: tipo, ordem: ordem }).then(function (resposta) {
            if (resposta.ok) {
                carregarLista(tipo);
            } else {
                aviso(resposta.erro || 'Não foi possível mudar a ordem.', 'erro');
            }
        });
    }

    /* ------------------------------------------------------------------
       Formularios
    ------------------------------------------------------------------ */

    function limparFormulario(tipo) {
        if (tipo === 'categorias') {
            $('#cat-id').value = '';
            $('#cat-nome').value = '';
            $('#cat-icone').value = 'ion-ios7-heart';
            $('#cat-posicao').value = '1';
            $('#titulo-form-categorias').textContent = 'Nova categoria';
            actualizarPreviaIcone();
        } else if (tipo === 'carousel') {
            $('#car-id').value = '';
            $('#car-legenda').value = '';
            $('#car-posicao').value = '1';
            $('#img-ficheiro-carousel').value = '';
            $('#img-file-id-carousel').value = '';
            $('#img-src-carousel').value = '';
            $('#img-previa-carousel').hidden = true;
            $('#img-previa-carousel').removeAttribute('src');
            mostrar($('#img-vazia-carousel'));
            $('#titulo-form-carousel').textContent = 'Nova imagem';
        } else if (tipo === 'produtos') {
            $('#prod-id').value = '';
            $('#prod-nome').value = '';
            $('#prod-preco').value = '';
            $('#prod-descricao').value = '';
            $('#prod-posicao').value = '1';
            $('#img-ficheiro-produtos').value = '';
            $('#img-file-id-produtos').value = '';
            $('#img-src-produtos').value = '';
            $('#img-previa-produtos').hidden = true;
            $('#img-previa-produtos').removeAttribute('src');
            mostrar($('#img-vazia-produtos'));
            $('#titulo-form-produtos').textContent = 'Novo produto';
        }
    }

    function urlTelegram(item) {
        if (!item || !item.telegram_file_id) {
            return '';
        }
        return '/api/public/imagem/' + encodeURIComponent(item.telegram_file_id);
    }

    function actualizarPreviaIcone() {
        var previa = $('#cat-icone-previa');
        var valor = ($('#cat-icone') || {}).value || '';

        if (!previa) {
            return;
        }

        previa.innerHTML = '';
        var i = document.createElement('i');
        i.className = valor || 'ion-ios7-heart';
        previa.appendChild(i);
    }

    function editar(tipo, item) {
        if (tipo === 'categorias') {
            $('#cat-id').value = item.id;
            $('#cat-nome').value = item.nome || '';
            $('#cat-icone').value = item.icone || 'ion-ios7-heart';
            $('#cat-posicao').value = String(item.posicao || 1);
            $('#titulo-form-categorias').textContent = 'Editar categoria';
            actualizarPreviaIcone();
            $('#cat-nome').focus();
        } else if (tipo === 'carousel') {
            $('#car-id').value = item.id;
            $('#car-legenda').value = item.legenda || '';
            $('#car-posicao').value = String(item.posicao || 1);
            $('#img-file-id-carousel').value = item.telegram_file_id || '';
            $('#img-src-carousel').value = item.src || urlTelegram(item);
            $('#titulo-form-carousel').textContent = 'Editar imagem';

            var previa = $('#img-previa-carousel');
            if (item.src || item.telegram_file_id) {
                previa.src = item.src || urlTelegram(item);
                previa.hidden = false;
                esconder($('#img-vazia-carousel'));
            }
        } else if (tipo === 'produtos') {
            $('#prod-id').value = item.id;
            $('#prod-nome').value = item.nome || '';
            $('#prod-preco').value = item.preco || '';
            $('#prod-categoria').value = item.categoria || '';
            $('#prod-descricao').value = item.descricao || '';
            $('#prod-posicao').value = String(item.posicao || 1);
            $('#img-file-id-produtos').value = item.telegram_file_id || '';
            $('#img-src-produtos').value = item.src || urlTelegram(item);
            $('#titulo-form-produtos').textContent = 'Editar produto';

            var previaProd = $('#img-previa-produtos');
            if (item.src || item.telegram_file_id) {
                previaProd.src = item.src || urlTelegram(item);
                previaProd.hidden = false;
                esconder($('#img-vazia-produtos'));
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function enviarFormulario(evento, tipo) {
        evento.preventDefault();

        var id = '';
        var item = {};

        if (tipo === 'categorias') {
            id = $('#cat-id').value;
            item = {
                id: id || undefined,
                nome: $('#cat-nome').value.trim(),
                icone: $('#cat-icone').value.trim() || 'ion-ios7-heart',
                posicao: parseInt($('#cat-posicao').value, 10) || 1
            };

            if (!item.nome) {
                aviso('Indique o nome da categoria.', 'erro');
                return;
            }
        } else if (tipo === 'carousel') {
            id = $('#car-id').value;
            item = {
                id: id || undefined,
                legenda: $('#car-legenda').value.trim(),
                src: $('#img-src-carousel').value.trim(),
                telegram_file_id: $('#img-file-id-carousel').value.trim(),
                posicao: parseInt($('#car-posicao').value, 10) || 1
            };

            if (!item.src && !item.telegram_file_id) {
                aviso('Escolha uma imagem (ficheiro) ou indique o caminho da imagem.', 'erro');
                return;
            }
        } else {
            id = $('#prod-id').value;
            item = {
                id: id || undefined,
                nome: $('#prod-nome').value.trim(),
                preco: $('#prod-preco').value.trim(),
                categoria: $('#prod-categoria').value,
                descricao: $('#prod-descricao').value.trim(),
                src: $('#img-src-produtos').value.trim(),
                telegram_file_id: $('#img-file-id-produtos').value.trim(),
                posicao: parseInt($('#prod-posicao').value, 10) || 1
            };

            if (!item.nome) {
                aviso('Indique o nome do produto.', 'erro');
                return;
            }
        }

        guardar(tipo, item).then(function (resposta) {
            if (resposta.ok) {
                limparFormulario(tipo);
            }
        });
    }

    /* ------------------------------------------------------------------
       Imagens: ficheiro -> Telegram
    ------------------------------------------------------------------ */

    function ficheiroParaBase64(ficheiro) {
        return new Promise(function (resolver, rejeitar) {
            var leitor = new FileReader();

            leitor.onload = function () {
                var resultado = String(leitor.result || '');
                resolver(resultado.indexOf(',') !== -1 ? resultado.split(',')[1] : resultado);
            };

            leitor.onerror = function () {
                rejeitar(new Error('Não foi possível ler o ficheiro.'));
            };

            leitor.readAsDataURL(ficheiro);
        });
    }

    function prepararImagem(ficheiro, inputFicheiro, inputFileId, inputSrc, imgPrevia, spanVazio, msgId) {
        limparErro(msgId);

        if (!ficheiro) {
            return Promise.resolve(false);
        }

        if (!/^image\//.test(ficheiro.type)) {
            erroFormulario(msgId, 'O ficheiro tem de ser uma imagem.');
            return Promise.resolve(false);
        }

        return ficheiroParaBase64(ficheiro).then(function (base64) {
            return chamar('POST', 'telegram', { ficheiro: base64, nome: ficheiro.name }).then(function (resposta) {
                if (!resposta.ok) {
                    erroFormulario(msgId, resposta.erro || 'Não foi possível enviar a imagem para o Telegram.');
                    return false;
                }

                var fileId = (resposta.telegram && resposta.telegram.file_id) || '';
                inputFileId.value = fileId;
                inputSrc.value = fileId ? '/api/public/imagem/' + encodeURIComponent(fileId) : '';

                if (fileId) {
                    imgPrevia.src = inputSrc.value;
                    imgPrevia.hidden = false;
                    esconder(spanVazio);
                } else {
                    imgPrevia.removeAttribute('src');
                    imgPrevia.hidden = true;
                    mostrar(spanVazio);
                }

                aviso('Imagem enviada para o Telegram.');
                return true;
            });
        }).catch(function (erro) {
            erroFormulario(msgId, erro.message || 'Erro ao processar a imagem.');
            return false;
        });
    }

    function ligarFicheiro(inputFicheiro, inputFileId, inputSrc, imgPrevia, spanVazio, msgId) {
        if (!inputFicheiro) {
            return;
        }

        inputFicheiro.addEventListener('change', function () {
            var ficheiro = inputFicheiro.files && inputFicheiro.files[0];
            if (!ficheiro) {
                return;
            }

            prepararImagem(ficheiro, inputFicheiro, inputFileId, inputSrc, imgPrevia, spanVazio, msgId);
        });
    }

    function actualizarPreviaDeUrl(inputSrc, imgPrevia, spanVazio) {
        if (!inputSrc) {
            return;
        }

        inputSrc.addEventListener('input', function () {
            var valor = inputSrc.value.trim();

            if (valor) {
                imgPrevia.src = valor;
                imgPrevia.hidden = false;
                esconder(spanVazio);
            } else {
                imgPrevia.removeAttribute('src');
                imgPrevia.hidden = true;
                mostrar(spanVazio);
            }
        });
    }

    /* ------------------------------------------------------------------
       Arranque
    ------------------------------------------------------------------ */

    function ligarEventos() {
        var formLogin = $('#form-login');
        if (formLogin) {
            formLogin.addEventListener('submit', entrar);
        }

        var btnSair = $('#btn-sair');
        if (btnSair) {
            btnSair.addEventListener('click', sair);
        }

        $$('.admin-aba').forEach(function (botao) {
            botao.addEventListener('click', function () {
                mudarAba(botao.getAttribute('data-aba'));
            });
        });

        var formCategorias = $('#form-categorias');
        if (formCategorias) {
            formCategorias.addEventListener('submit', function (evento) {
                enviarFormulario(evento, 'categorias');
            });
        }

        var formCarousel = $('#form-carousel');
        if (formCarousel) {
            formCarousel.addEventListener('submit', function (evento) {
                enviarFormulario(evento, 'carousel');
            });
        }

        var formProdutos = $('#form-produtos');
        if (formProdutos) {
            formProdutos.addEventListener('submit', function (evento) {
                enviarFormulario(evento, 'produtos');
            });
        }

        $('#btn-cancelar-categorias').addEventListener('click', function () {
            limparFormulario('categorias');
        });
        $('#btn-cancelar-carousel').addEventListener('click', function () {
            limparFormulario('carousel');
        });
        $('#btn-cancelar-produtos').addEventListener('click', function () {
            limparFormulario('produtos');
        });

        var campoIcone = $('#cat-icone');
        if (campoIcone) {
            campoIcone.addEventListener('input', actualizarPreviaIcone);
        }

        ligarFicheiro($('#img-ficheiro-carousel'), $('#img-file-id-carousel'), $('#img-src-carousel'),
            $('#img-previa-carousel'), $('#img-vazia-carousel'), '#img-msg-carousel');

        ligarFicheiro($('#img-ficheiro-produtos'), $('#img-file-id-produtos'), $('#img-src-produtos'),
            $('#img-previa-produtos'), $('#img-vazia-produtos'), '#img-msg-produtos');

        actualizarPreviaDeUrl($('#img-src-carousel'), $('#img-previa-carousel'), $('#img-vazia-carousel'));
        actualizarPreviaDeUrl($('#img-src-produtos'), $('#img-previa-produtos'), $('#img-vazia-produtos'));
    }

    function iniciar() {
        ligarEventos();
        actualizarPreviaIcone();

        var guardado = lerToken();
        if (guardado) {
            token = guardado;
            mostrarPainel();
            carregarTudo();
        } else {
            mostrarLogin();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
