var $ = jQuery;

jQuery(document).ready(function($) {  

    // O preloader sai assim que o DOM está pronto, sem esperar pelo video
    var removerPreloader = function() {
        $('#preloader').fadeOut('slow',function(){$(this).remove();});
    };

    $(document).ready(removerPreloader);
    setTimeout(removerPreloader, 1200);
    setTimeout(removerPreloader, 3500); // fallback seguro para o telemóvel

});

// Setting up Video

var $ = jQuery;

// Páginas internas usam um hero curto; a página inicial ocupa o ecrã inteiro
var isPageHero = $('#video-wrap').hasClass('page-hero');

function alturaHero() {
    if (isPageHero) { return 360; }
    return Math.max($(window).height(), 400);
}

var heroHeight = alturaHero();

$("#video-wrap").css({

    'height': heroHeight
});

// Em telemóveis, ligações lentas ou com movimento reduzido, usa apenas o poster.
// O vídeo de fundo tem ~11 MB e demora demasiado a aparecer nestes dispositivos.
var ligacao = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
var ligacaoLenta = !!(ligacao && (ligacao.saveData || /2g|3g/.test(ligacao.effectiveType || '')));
var ecraPequeno = window.matchMedia('(max-width: 900px)').matches ||
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;
var modoPoster = ecraPequeno ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    ligacaoLenta;

if (modoPoster) {
    $('#video-wrap').addClass('video-poster');
} else {
    $('#video').videoBG({
        mp4:'assets/bg.mp4',
        ogv:'assets/bg.ogv',
        webm:'assets/bg.webm',
        poster:'assets/poster.jpg',
        scale:true,
        zIndex:0,
        height: heroHeight
    });

    // Só descarrega os metadados do video, para nao bloquear o carregamento
    $('#video video').attr('preload', 'metadata');
}

// Recalcular a altura do hero quando a janela muda de tamanho
// (ex.: quando a janela e maximizada depois da pagina carregar)
var timerRedimensionar;
$(window).on('resize orientationchange', function() {
    clearTimeout(timerRedimensionar);
    timerRedimensionar = setTimeout(function() {
        heroHeight = alturaHero();
        $('#video-wrap').css({
            'height': heroHeight
        });
    }, 150);
});

// Autoplay: muted + loop infinito + fallback para quando o browser bloqueia o video
(function() {
    var video = document.querySelector('#video video');
    if (!video) { return; }

    video.muted = true;
    video.setAttribute('muted', 'muted');
    video.loop = true;
    video.setAttribute('loop', 'loop');

    var tentar = function() {
        var p = video.play();
        if (p && typeof p.catch === 'function') { p.catch(function(){}); }
    };

    tentar();

    // Se ainda assim ficar bloqueado, arranca na primeira interacao
    var eventos = ['click', 'keydown', 'touchstart', 'scroll'];
    var feito = function() {
        tentar();
        eventos.forEach(function(ev) {
            document.removeEventListener(ev, feito);
        });
    };
    eventos.forEach(function(ev) {
        document.addEventListener(ev, feito, { once: true, passive: true });
    });
})();

// Video do cartao "Qualidade" (DESTAQUES): loop infinito e sempre em silencio
(function() {
    var videos = document.querySelectorAll('.destaque-video');
    Array.prototype.forEach.call(videos, function(video) {
        video.muted = true;
        video.setAttribute('muted', 'muted');
        video.loop = true;
        video.setAttribute('loop', 'loop');
        video.setAttribute('playsinline', 'playsinline');

        var tentar = function() {
            var p = video.play();
            if (p && typeof p.catch === 'function') { p.catch(function(){}); }
        };

        video.addEventListener('canplay', tentar);
        video.addEventListener('loadeddata', tentar);
        video.addEventListener('ended', function() {
            video.currentTime = 0;
            tentar();
        });

        tentar();
    });
})();

// Navbar fixing - usa position: sticky no CSS (mais fiável que o sticky-kit)


// Calling Wow

$(document).ready(function() {
    var wow = new WOW();
    wow.init();

    // Recalcula as posicoes quando o layout estabilizar (video/fontes)
    setTimeout(function() {
        if (typeof wow.update === 'function') { wow.update(); }
    }, 600);
});


// O contador de dias/horas foi removido (no hero esta agora a lista de serviços)


// rotating text


(function() {

    var quotes = $(".quotes");
    if (quotes.length === 0) { return; }
    var quoteIndex = -1;
    
    function showNextQuote() {
        ++quoteIndex;
        quotes.eq(quoteIndex % quotes.length)
            .fadeIn(1000)
            .delay(1000)
            .fadeOut(1000, showNextQuote);
    }
    
    showNextQuote();
    
})();

// smooth mouse wheel
$(function() {
  $('a[href*=#]:not([href=#])').click(function() {
    if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'') && location.hostname == this.hostname) {
      var target = $(this.hash);
      target = target.length ? target : $('[name=' + this.hash.slice(1) +']');
      if (target.length) {
        $('html,body').animate({
          scrollTop: target.offset().top
        }, 1000);
        return false;
      }
    }
    });

});


/*------------------------------------------
 Contact form ajax
 ------------------------------------------*/


$('#contact-form').submit(function(e) {

    e.preventDefault();
    var $form        = $('#contact-form');
    var ajaxResponse = $('#contact-response');
    var botao        = $form.find('button[type="submit"]');
    var dados        = $(this).serialize();

    $.ajax({
        type: 'POST',
        url: 'php/contacto.php',
        dataType: 'json',
        data: dados,
        cache: false,
        beforeSend: function() {
            botao.prop('disabled', true).text('Enviando...');
        },
        success: function(result) {
            ajaxResponse.html(result.message);
            if(result.sendstatus == 1) {
                $form.fadeOut(500);
            } else {
                botao.prop('disabled', false).html('Submit <i class="ion-arrow-graph-up-right"></i>');
            }
        },
        error: function() {
            ajaxResponse.html('<div class="alert alert-danger"><strong>Erro:</strong> Falha ao enviar. Tente o telefone +244 933 354 976.</div>');
            botao.prop('disabled', false).html('Submit <i class="ion-arrow-graph-up-right"></i>');
        }
    });

});

/*------------------------------------------
 Subscribe form ajax
 ------------------------------------------*/


$('#subscribe-form').submit(function(e) {

    e.preventDefault();
    var $form           = $('#subscribe-form');
    var submit          = $('#subscribe-button');
    var ajaxResponse    = $('#subscription-response');
    var email           = $('#subscriber-email').val();

    $.ajax({
        type: 'POST',
        url: 'php/subscribe.php',
        dataType: 'json',
        data: {
            email: email
        },
        cache: false,
        beforeSend: function(result) {
            submit.val("Joining...");
        },
        success: function(result) {
            if(result.sendstatus == 1) {
                ajaxResponse.html(result.message);
                $form.fadeOut(500);
            } else {
                ajaxResponse.html(result.message);
                submit.val("Join");
            }
        }
    });

});

/*------------------------------------------
  Serviços: filtros clicáveis na página Explorar
 ------------------------------------------*/

$(function() {
    var $cards = $('.servico-card');
    var $btnLimpar = $('#btn-limpar-filtro');
    var ehExplorar = $('body').hasClass('page-explorar');

    function atualizarBotaoLimpar() {
        var algumSelecionado = $('.servico-card.selecionado').length > 0;
        $btnLimpar.toggle(algumSelecionado);
    }

    function alternarFiltro(card) {
        var $card = $(card);
        if (!$card.hasClass('selecionado')) {
            $cards.removeClass('selecionado').attr('aria-pressed', 'false');
            $card.addClass('selecionado').attr('aria-pressed', 'true');
        } else {
            $card.removeClass('selecionado').attr('aria-pressed', 'false');
        }
        atualizarBotaoLimpar();
    }

    if (ehExplorar) {
        $(document).on('click', '.servico-card', function() {
            alternarFiltro(this);
        });

        $(document).on('keydown', '.servico-card', function(e) {
            var key = e.key || e.keyCode;

            if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
                e.preventDefault();
                alternarFiltro(this);
            }
        });

        $('#btn-limpar-filtro').on('click', function() {
            $cards.removeClass('selecionado').attr('aria-pressed', 'false');
            atualizarBotaoLimpar();
        });
    } else {
        $(document).on('click', '.servico-card', function() {
            window.location.href = 'explorar.html';
        });

        $(document).on('keydown', '.servico-card', function(e) {
            var key = e.key || e.keyCode;

            if (key === 'Enter' || key === ' ' || key === 13 || key === 32) {
                e.preventDefault();
                window.location.href = 'explorar.html';
            }
        });
    }
});

/*------------------------------------------
  Lista de serviços em gaveta (telemóvel)
 ------------------------------------------*/

$(function() {
    var $painel = $('.servicos-painel');
    var $botao  = $('.servicos-toggle');
    var $fundo  = $('.servicos-backdrop');
    var $fechar = $('.servicos-fechar');

    function abrirGaveta() {
        $painel.addClass('aberto');
        $fundo.addClass('visivel');
        $botao.attr('aria-expanded', 'true');
        $('body').addClass('servicos-aberto');
    }

    function fecharGaveta() {
        $painel.removeClass('aberto');
        $fundo.removeClass('visivel');
        $botao.attr('aria-expanded', 'false');
        $('body').removeClass('servicos-aberto');
    }

    $botao.on('click', function() {
        if ($painel.hasClass('aberto')) {
            fecharGaveta();
        } else {
            abrirGaveta();
        }
    });

    $fechar.on('click', fecharGaveta);
    $fundo.on('click', fecharGaveta);

    $(document).on('keydown', function(e) {
        var key = e.key || e.keyCode;

        if (key === 'Escape' || key === 27) {
            fecharGaveta();
        }
    });

    /* Escolher um serviço fecha a gaveta (o modal mostra o detalhe) */
    $(document).on('click', '.servico-card', function() {
        fecharGaveta();
    });
});

/*------------------------------------------
   Dados do painel de administração (API pública)
   - categorias, imagens do carousel e produtos
   - se a API não responder, o HTML estático mantém-se
  ------------------------------------------*/

(function() {

    var produtos = [];

    function apiPublico(rota) {
        if (typeof fetch === 'undefined') { return Promise.resolve(null); }

        return fetch('/api/public/' + rota, { headers: { 'Accept': 'application/json' } })
            .then(function(resposta) {
                if (!resposta.ok) { throw new Error('HTTP ' + resposta.status); }
                return resposta.json();
            })
            .then(function(dados) {
                if (!dados || !dados.ok) { return null; }
                return dados.dados || [];
            })
            .catch(function() {
                return null;
            });
    }

    function pintarCategorias(lista) {
        var $lista = $('.servicos-lista');

        if (!$lista.length || !lista || !lista.length) { return; }

        $lista.empty();

        lista.forEach(function(item) {
            var $li = $('<li class="servico-card" role="button" tabindex="0"></li>');
            var $div = $('<div></div>');

            $('<i></i>').addClass(item.icone || 'ion-ios7-heart').appendTo($li);
            $('<h4></h4>').text(item.nome || '').appendTo($div);

            if (item.descricao) {
                $('<p class="servico-desc"></p>').text(item.descricao).appendTo($div);
            }

            $div.appendTo($li);
            $li.appendTo($lista);
        });
    }

function prepararImagensLaterais(){
    var $trilho = $('.servicos-imagens-trilho');
    if (!$trilho.length) return;
    if ($trilho.data("blurPronto")) return;
    $trilho.find('img').each(function(){
        var $img = $(this);
        if ($img.parent('.servico-img-bg').length) return;
        var src = $img.attr('src');
        if (!src) return;
        var $wrap = $('<div class="servico-img-bg"></div>');
        $wrap.css('background-image', 'url(' + src.replace(/"/g, '%22') + ')');
        $img.before($wrap);
        $wrap.append($img);
    });
    $trilho.data("blurPronto", true);
}
    function pintarCarousel(lista) {
        var $trilho = $('.servicos-imagens-trilho');

        if (!$trilho.length || !lista || !lista.length) { return; }

        $trilho.empty();

        // A lista é repetida para o ciclo da animação ser continuo
        lista.concat(lista).forEach(function(item) {
            if (!item.src) { return; }
            $('<img></img>').attr('src', item.src).attr('alt', item.legenda || '').appendTo($trilho);
        });
        prepararImagensLaterais();
    }

    function produtosFiltrados() {
        var $selecionado = $('.servico-card.selecionado');

        if (!$selecionado.length) { return produtos; }

        var categoria = ($selecionado.find('h4').text() || '').trim().toLowerCase();

        return produtos.filter(function(item) {
            return (item.categoria || '').trim().toLowerCase() === categoria;
        });
    }

    function pintarProdutos() {
        var $grelha = $('#produtos-grelha');

        if (!$grelha.length) { return; }

        $grelha.empty();

        var lista = produtosFiltrados();

        if (!lista.length) {
            $('<p class="produtos-vazio"></p>')
                .text(produtos.length ? 'Não há produtos nesta categoria.' : 'Ainda não há produtos publicados.')
                .appendTo($grelha);
            return;
        }

        lista.forEach(function(item) {
            var $card = $('<article class="produto-card"></article>');
            var $corpo = $('<div class="produto-corpo"></div>');

            if (item.src) {
                $('<img class="produto-img"></img>').attr('src', item.src).attr('alt', item.nome || '').appendTo($card);
            }

            if (item.categoria) {
                $('<span class="produto-cat"></span>').text(item.categoria).appendTo($corpo);
            }

            $('<h4 class="produto-nome"></h4>').text(item.nome || '').appendTo($corpo);

            if (item.descricao) {
                $('<p class="produto-desc"></p>').text(item.descricao).appendTo($corpo);
            }

            if (item.preco) {
                $('<span class="produto-preco"></span>').text(item.preco).appendTo($corpo);
            }

            $corpo.appendTo($card);
            $card.appendTo($grelha);
        });
    }

    $(function() {

        apiPublico('categorias').then(function(lista) {
            if (lista) { pintarCategorias(lista); }
        });

        apiPublico('carousel').then(function(lista) {
            if (lista) { pintarCarousel(lista); }
        });

        apiPublico('produtos').then(function(lista) {
            if (lista) {
                produtos = lista;
                pintarProdutos();
            }
        });

        // Ao filtrar por um serviço, os produtos acompanham a categoria
        $(document).on('click', '.servico-card, #btn-limpar-filtro', function() {
            window.setTimeout(pintarProdutos, 0);
        });
    });

})();