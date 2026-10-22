import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  getHealthCheckQueryKey,
  useCreateOrder,
  useHealthCheck,
} from '@workspace/api-client-react';
import type { Order, OrderInput } from '@workspace/api-client-react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  Coffee,
  Flower2,
  Gift,
  Heart,
  HeartHandshake,
  Mail,
  Minus,
  MoonStar,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sunrise,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Category = 'Experiências' | 'Caixas & mimos' | 'Flores' | 'Pequenos gestos';
type Product = {
  id: string;
  name: string;
  category: Category;
  price: number;
  note: string;
  label: string;
  icon: LucideIcon;
  color: string;
  ink: string;
};
type CartEntry = { product: Product; quantity: number };

// Sample prices live here so they can be updated without touching the order flow.
const products: Product[] = [
  {
    id: 'noite-a-dois',
    name: 'Noite a Dois',
    category: 'Experiências',
    price: 120000,
    note: 'Uma noite preparada para esquecer as horas e celebrar vocês.',
    label: 'Mais pedido',
    icon: MoonStar,
    color: '#dfb5a3',
    ink: '#773e4b',
  },
  {
    id: 'caixa-amor',
    name: 'Caixa do Amor',
    category: 'Caixas & mimos',
    price: 45000,
    note: 'Pequenas delicadezas escolhidas para fazer o coração sorrir.',
    label: 'Feito à mão',
    icon: Gift,
    color: '#c77f7f',
    ink: '#702d3a',
  },
  {
    id: 'rosas-surpresa',
    name: 'Rosas de Surpresa',
    category: 'Flores',
    price: 35000,
    note: 'Um ramo de rosas frescas, com uma mensagem só vossa.',
    label: 'Um clássico',
    icon: Flower2,
    color: '#e6c2b0',
    ink: '#8a4656',
  },
  {
    id: 'pequeno-almoco',
    name: 'Pequeno-almoço Romântico',
    category: 'Experiências',
    price: 65000,
    note: 'A manhã começa melhor quando chega com carinho à porta.',
    label: 'Surpresa doce',
    icon: Sunrise,
    color: '#e7c997',
    ink: '#77543a',
  },
  {
    id: 'piquenique',
    name: 'Piquenique a Dois',
    category: 'Experiências',
    price: 90000,
    note: 'Uma pausa bonita ao ar livre, com tudo pensado por nós.',
    label: 'Ao ar livre',
    icon: Coffee,
    color: '#b6b69a',
    ink: '#4a5945',
  },
  {
    id: 'carta-perfume',
    name: 'Carta & Perfume',
    category: 'Pequenos gestos',
    price: 30000,
    note: 'Palavras suas, um aroma especial e um gesto para guardar.',
    label: 'Só vosso',
    icon: Mail,
    color: '#d7a7a4',
    ink: '#743d49',
  },
];

const categories = ['Tudo', 'Experiências', 'Caixas & mimos', 'Flores', 'Pequenos gestos'] as const;
const formatKz = (amount: number) =>
  `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(amount)} Kz`;

function App() {
  const [selectedCategory, setSelectedCategory] = useState<(typeof categories)[number]>('Tudo');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<Order | null>(null);
  const [formError, setFormError] = useState('');
  const createOrder = useCreateOrder();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000, retry: 1 } });

  const visibleProducts = useMemo(
    () => selectedCategory === 'Tudo' ? products : products.filter((item) => item.category === selectedCategory),
    [selectedCategory],
  );
  const cartCount = cart.reduce((total, entry) => total + entry.quantity, 0);
  const total = cart.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0);

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) => current
      .map((entry) => entry.product.id === productId ? { ...entry, quantity: entry.quantity + delta } : entry)
      .filter((entry) => entry.quantity > 0));
  };

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((entry) => entry.product.id === product.id);
      return existing
        ? current.map((entry) => entry.product.id === product.id
          ? { ...entry, quantity: entry.quantity + 1 }
          : entry)
        : [...current, { product, quantity: 1 }];
    });
  };

  const sendOrderToWhatsApp = () => {
    if (cart.length === 0) return;
    const lines = cart.map(({ product, quantity }) =>
      `• ${product.name} — ${quantity} × ${formatKz(product.price)} = ${formatKz(product.price * quantity)}`,
    );
    const message = [
      'Olá, Antônia Decoração! Gostaria de fazer este pedido:',
      '',
      ...lines,
      '',
      `Total estimado: ${formatKz(total)}`,
      '',
      'Confirmamos consigo os detalhes antes de preparar a surpresa.',
    ].join('\n');
    setCartOpen(false);
    window.open(`https://wa.me/244933354976?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const formData = new FormData(event.currentTarget);
    const input: OrderInput = {
      customerName: String(formData.get('customerName') ?? '').trim(),
      recipientName: String(formData.get('recipientName') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim() || null,
      occasion: String(formData.get('occasion') ?? '').trim(),
      deliveryAddress: String(formData.get('deliveryAddress') ?? '').trim(),
      eventDate: String(formData.get('eventDate') ?? '') || null,
      note: String(formData.get('note') ?? '').trim() || null,
      items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
    };

    createOrder.mutate(
      { data: input },
      {
        onSuccess: (order: Order) => {
          setOrderSuccess(order);
          setCart([]);
        },
        onError: (error: Error) => {
          const message = error instanceof Error ? error.message : 'Não foi possível enviar o pedido.';
          setFormError(`${message} Tente novamente ou fale connosco por telefone.`);
        },
      },
    );
  };

  return (
    <div className="site-shell">
      <header className="nav-shell">
        <div className="navbar">
        <a className="brand" href="#inicio" aria-label="Antônia Decoração - O Mundo Das Surpresas">
          <span className="brand-letter">A</span>
          <span className="brand-name">Antônia Decoração<small>O Mundo Das Surpresas</small></span>
        </a>
        <nav className="navlinks" aria-label="Navegação principal">
          <a href="#presentes">Presentes</a>
          <a href="#nossa-forma">A nossa forma</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <button className="cart-button" onClick={() => setCartOpen(true)} data-testid="button-open-cart" aria-label={`Abrir carrinho, ${cartCount} artigos`}>
          <ShoppingBag size={16} />
          <span>O meu cesto</span>
          <span className="cart-count" data-testid="text-cart-count">{cartCount}</span>
        </button>
        </div>
      </header>

      <main id="inicio">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-panel">
            <div className="hero-copy">
              <div className="eyebrow">Surpresas com sentimento</div>
              <h1 id="hero-title">O amor merece <em>um momento só dele.</em></h1>
              <p>Escolha um gesto, conte-nos a ocasião. Nós tratamos dos detalhes para que a surpresa fale por si.</p>
              <a className="primary-cta" href="#presentes">Encontrar o presente certo <ArrowRight size={15} /></a>
              <div className="trust-row">
                <span className="trust-item"><HeartHandshake size={15} /> Preparado com carinho</span>
                <span className="trust-item"><ShieldCheck size={15} /> Pedido acompanhado</span>
              </div>
            </div>
            <div className="hero-photo" role="img" aria-label="Mesa romântica preparada para uma surpresa a dois">
              <img src="/logo-antonia-marca.png" alt="Antônia Decoração" className="hero-seal-logo" />
            </div>
          </div>
        </section>

        <div className="intro-strip">
          <div className="intro-line" />
          <p>“Os melhores presentes não dizem apenas que pensámos em ti. Mostram como.”</p>
          <div className="intro-line" />
        </div>

        <section className="shop-section" id="presentes" aria-labelledby="shop-title">
          <div className="section-header">
            <div>
              <div className="section-kicker">Uma ocasião, muitas maneiras de amar</div>
              <h2 id="shop-title">Escolha o vosso momento.</h2>
            </div>
            <p className="section-note">Cada surpresa é um ponto de partida. Deixe-nos os detalhes especiais no seu pedido.</p>
          </div>
          <div className="category-list" role="group" aria-label="Filtrar por categoria">
            {categories.map((category) => (
              <button
                key={category}
                className={`category-chip${selectedCategory === category ? ' active' : ''}`}
                onClick={() => setSelectedCategory(category)}
                aria-pressed={selectedCategory === category}
                data-testid={`filter-${category.toLowerCase().replaceAll(' ', '-')}`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="product-grid" aria-live="polite">
            {visibleProducts.map((product) => {
              const Icon = product.icon;
              return (
                <article className="product-card" key={product.id} data-testid={`card-product-${product.id}`}>
                  <div className="product-visual" style={{ '--product-bg': product.color, '--product-ink': product.ink } as CSSProperties}>
                    <span className="product-tag">{product.label}</span>
                    <span className="product-symbol"><Icon size={42} strokeWidth={1.3} /></span>
                  </div>
                  <div className="product-info">
                    <div className="product-meta">{product.category}</div>
                    <div className="product-title-row">
                      <h3 className="product-title">{product.name}</h3>
                      <span className="product-price">{formatKz(product.price)}</span>
                    </div>
                    <p className="product-desc">{product.note}</p>
                    <button className="add-button" onClick={() => addToCart(product)} data-testid={`button-add-${product.id}`}>
                      <Plus size={14} /> Juntar ao cesto
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="promise-band" id="nossa-forma">
          <div className="promise-intro">
            <div className="section-kicker">Não é só entregar</div>
            <h2>É fazer alguém sentir-se lembrado.</h2>
            <p>Conte-nos a vossa história. A surpresa começa muito antes de chegar às mãos de quem ama.</p>
          </div>
          <div className="promise-item">
            <h3>Um toque pessoal</h3>
            <p>Escreva a sua mensagem e diga-nos o que torna esta ocasião especial. Cada pedido tem o seu próprio cuidado.</p>
          </div>
          <div className="promise-item">
            <h3>Combinado consigo</h3>
            <p>Recebemos o seu pedido e falamos consigo para confirmar os detalhes, a data e a melhor forma de surpreender.</p>
          </div>
        </section>

        <section className="story-section">
          <div className="story-inner">
            <div>
              <div className="section-kicker" style={{ color: '#e4b99f' }}>O detalhe que fica</div>
              <p className="story-quote">Uma surpresa bonita não precisa de uma grande ocasião. Às vezes, <em>o motivo é simplesmente amar.</em></p>
              <div className="story-credit">Surpresas Românticas · Luanda, Angola</div>
            </div>
            <div className="story-stamp">para guardar<small>momentos com intenção</small></div>
          </div>
        </section>
      </main>

      <footer className="footer" id="contacto">
        <div className="footer-inner">
          <a className="brand" href="#inicio" aria-label="Voltar ao início">
            <span className="brand-mark"><Heart size={18} strokeWidth={1.5} /></span>
            <span className="brand-name">Surpresas Românticas<small>feito para dizer: amo-te</small></span>
          </a>
          <div className="footer-copy">Um gesto de cada vez. © {new Date().getFullYear()}</div>
          <a className="footer-contact" href="tel:+244923000000"><Heart size={14} /> Vamos conversar</a>
        </div>
      </footer>

      {cartOpen && (
        <>
          <button className="drawer-scrim" onClick={() => setCartOpen(false)} aria-label="Fechar cesto" />
          <aside className="drawer" aria-label="O meu cesto" aria-modal="true" role="dialog">
            <div className="drawer-head">
              <h2>O meu cesto <span style={{ fontSize: 15 }}>({cartCount})</span></h2>
              <button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Fechar cesto" data-testid="button-close-cart"><X size={19} /></button>
            </div>
            <div className="drawer-content">
              {cart.length === 0 ? (
                <div className="empty-cart">
                  <ShoppingBag size={32} strokeWidth={1.3} />
                  <h3>O cesto ainda está à espera.</h3>
                  <p>Encontre uma surpresa que diga tudo sem precisar de muitas palavras.</p>
                </div>
              ) : cart.map(({ product, quantity }) => (
                <div className="cart-line" key={product.id} data-testid={`cart-item-${product.id}`}>
                  <div>
                    <h3>{product.name}</h3>
                    <p>{formatKz(product.price)} por unidade</p>
                    <div className="quantity-control" aria-label={`Quantidade de ${product.name}`}>
                      <button onClick={() => updateQuantity(product.id, -1)} aria-label={`Diminuir ${product.name}`} data-testid={`button-decrease-${product.id}`}><Minus size={12} /></button>
                      <span>{quantity}</span>
                      <button onClick={() => updateQuantity(product.id, 1)} aria-label={`Aumentar ${product.name}`} data-testid={`button-increase-${product.id}`}><Plus size={12} /></button>
                    </div>
                  </div>
                  <span className="cart-line-price">{formatKz(product.price * quantity)}</span>
                </div>
              ))}
            </div>
            <div className="drawer-foot">
              <div className="total-row"><span>Total estimado</span><strong>{formatKz(total)}</strong></div>
              <button className="primary-cta checkout-button" disabled={cart.length === 0} onClick={sendOrderToWhatsApp} data-testid="button-checkout">
                Fazer o meu pedido <ArrowRight size={15} />
              </button>
              <p className="checkout-note">Confirmamos consigo os detalhes antes de preparar a surpresa.</p>
            </div>
          </aside>
        </>
      )}

      {checkoutOpen && (
        <div className="checkout-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !createOrder.isPending) setCheckoutOpen(false);
        }}>
          <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <button className="icon-button modal-close" onClick={() => !createOrder.isPending && setCheckoutOpen(false)} aria-label="Fechar formulário" data-testid="button-close-checkout"><X size={19} /></button>
            {orderSuccess ? (
              <div className="success-view" data-testid="status-order-success">
                <span className="success-seal"><CircleCheck size={32} strokeWidth={1.5} /></span>
                <div className="section-kicker">Pedido recebido</div>
                <h2>Agora deixamos o carinho connosco.</h2>
                <p>Obrigado, {orderSuccess.customerName}. Vamos entrar em contacto para confirmar os detalhes da sua surpresa e combinar tudo consigo.</p>
                <div className="order-reference">Referência do pedido <strong>#{orderSuccess.id}</strong> · {formatKz(orderSuccess.total)}</div>
                <button className="primary-cta" onClick={() => setCheckoutOpen(false)} data-testid="button-finish-order"><Check size={15} /> Está combinado</button>
              </div>
            ) : (
              <>
                <div className="section-kicker">O próximo passo é nosso</div>
                <h2 id="checkout-title">Conte-nos para quem é.</h2>
                <p className="checkout-lede">Deixe os seus dados e os detalhes da ocasião. Este pedido não é uma cobrança: vamos falar consigo para confirmar a surpresa.</p>
                <div className="order-summary">
                  <span>{cartCount} {cartCount === 1 ? 'surpresa escolhida' : 'surpresas escolhidas'}</span>
                  <strong>{formatKz(total)}</strong>
                </div>
                <form onSubmit={submitOrder}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label htmlFor="customerName">O seu nome *</label>
                      <input id="customerName" name="customerName" autoComplete="name" minLength={2} maxLength={100} required placeholder="Como podemos chamar-lhe?" data-testid="input-customer-name" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="recipientName">Nome de quem vai receber *</label>
                      <input id="recipientName" name="recipientName" autoComplete="off" minLength={2} maxLength={100} required placeholder="A pessoa especial" data-testid="input-recipient-name" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="phone">Telefone *</label>
                      <input id="phone" name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={30} required placeholder="+244 9..." data-testid="input-phone" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="email">E-mail <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                      <input id="email" name="email" type="email" autoComplete="email" placeholder="nome@exemplo.com" data-testid="input-email" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="occasion">Qual é a ocasião? *</label>
                      <select id="occasion" name="occasion" required defaultValue="" data-testid="select-occasion">
                        <option value="" disabled>Escolha uma ocasião</option>
                        <option>Aniversário</option>
                        <option>Pedido especial</option>
                        <option>Data de namoro</option>
                        <option>Casamento</option>
                        <option>Surpresa sem motivo</option>
                        <option>Outra ocasião</option>
                      </select>
                    </div>
                    <div className="form-field full">
                      <label htmlFor="deliveryAddress">Morada de entrega *</label>
                      <textarea id="deliveryAddress" name="deliveryAddress" autoComplete="street-address" minLength={5} maxLength={300} required placeholder="Rua, bairro, município e um ponto de referência" data-testid="input-delivery-address" />
                    </div>
                    <div className="form-field full">
                      <label htmlFor="eventDate"><CalendarDays size={12} style={{ display: 'inline', marginRight: 5 }} />Data da surpresa <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                      <input id="eventDate" name="eventDate" type="date" min={new Date().toISOString().slice(0, 10)} data-testid="input-event-date" />
                    </div>
                    <div className="form-field full">
                      <label htmlFor="note">Uma mensagem ou detalhe especial <span style={{ fontWeight: 400 }}>(opcional)</span></label>
                      <textarea id="note" name="note" maxLength={1000} placeholder="Conte-nos o que devemos saber para tornar este momento ainda mais vosso." data-testid="input-note" />
                    </div>
                  </div>
                  {formError && <p className="form-error" role="alert" data-testid="status-order-error">{formError}</p>}
                  {health.isError && <p className="form-error" role="status">Estamos com dificuldade em confirmar a ligação. Pode tentar enviar o pedido na mesma.</p>}
                  <button className="primary-cta form-submit" type="submit" disabled={createOrder.isPending || cart.length === 0} data-testid="button-submit-order">
                    {createOrder.isPending ? 'A enviar o seu pedido…' : <>Enviar pedido com carinho <ArrowRight size={15} /></>}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
