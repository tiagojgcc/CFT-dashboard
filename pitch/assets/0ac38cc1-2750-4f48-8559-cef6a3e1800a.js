/* @ds-bundle: {"format":3,"namespace":"CFTDesignSystem_00b40f","components":[],"sourceHashes":{"ui_kits/cft_camp/Components.jsx":"e3d3682ae194"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CFTDesignSystem_00b40f = window.CFTDesignSystem_00b40f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/cft_camp/Components.jsx
try { (() => {
// CFT UI Kit — Shared Components
// Load with <script type="text/babel" src="Components.jsx"></script>

const {
  useState,
  useEffect
} = React;

// ── Nav ───────────────────────────────────────────────────────────────────────
function NavBar({
  activePage,
  onNav
}) {
  const links = ['Campus', 'Treinadores', 'Programa', 'Galeria'];
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      background: '#1c1c18',
      height: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer'
    },
    onClick: () => onNav('home')
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo_CFT.png",
    alt: "CFT",
    style: {
      height: 30,
      filter: 'brightness(0) invert(1)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 28
    }
  }, links.map(l => /*#__PURE__*/React.createElement("span", {
    key: l,
    onClick: () => onNav(l.toLowerCase()),
    style: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 700,
      fontSize: 14,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: activePage === l.toLowerCase() ? '#78c832' : '#c9b99a',
      cursor: 'pointer',
      transition: 'color 150ms'
    }
  }, l))), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNav('inscricao'),
    style: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      background: '#2d6b3c',
      color: '#fff',
      border: 'none',
      padding: '9px 20px',
      borderRadius: 5,
      cursor: 'pointer'
    }
  }, "Inscri\xE7\xE3o"));
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({
  children,
  variant = 'green'
}) {
  const styles = {
    green: {
      background: '#2d6b3c',
      color: '#fff'
    },
    bright: {
      background: '#78c832',
      color: '#1c1c18'
    },
    orange: {
      background: '#d4845a',
      color: '#fff'
    },
    dark: {
      background: '#1c1c18',
      color: '#f4ede0'
    },
    sand: {
      background: '#e5d9c4',
      color: '#1c1c18'
    }
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      ...styles[variant],
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      borderRadius: 4,
      padding: '4px 10px',
      display: 'inline-block'
    }
  }, children);
}

// ── Button ────────────────────────────────────────────────────────────────────
function Btn({
  children,
  variant = 'primary',
  onClick,
  style = {}
}) {
  const base = {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'all 150ms ease-out',
    display: 'inline-block'
  };
  const variants = {
    primary: {
      background: '#2d6b3c',
      color: '#fff',
      padding: '13px 32px',
      fontSize: 16
    },
    secondary: {
      background: 'transparent',
      color: '#2d6b3c',
      border: '2px solid #2d6b3c',
      padding: '11px 30px',
      fontSize: 16
    },
    accent: {
      background: '#d4845a',
      color: '#fff',
      padding: '13px 32px',
      fontSize: 16
    },
    dark: {
      background: '#1c1c18',
      color: '#f4ede0',
      padding: '13px 32px',
      fontSize: 16
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    style: {
      ...base,
      ...variants[variant],
      ...style
    },
    onClick: onClick
  }, children);
}

// ── Overline ──────────────────────────────────────────────────────────────────
function Overline({
  children,
  color = '#2d6b3c'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color,
      marginBottom: 8
    }
  }, children);
}

// ── Section Label ─────────────────────────────────────────────────────────────
function SectionLabel({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color: '#6b6b65',
      marginBottom: 6
    }
  }, children);
}

// ── Coach Card ────────────────────────────────────────────────────────────────
function CoachCard({
  name,
  initials,
  role,
  accent = '#2d6b3c'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#1c1c18',
      borderRadius: 8,
      overflow: 'hidden',
      flex: 1,
      minWidth: 140
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 100,
      background: `linear-gradient(160deg, ${accent}cc, #111)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: accent + '33',
      border: `2px solid ${accent}88`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 26,
      color: '#f4ede0'
    }
  }, initials)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 22,
      color: '#f4ede0',
      lineHeight: 1
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: '#6b8a6a',
      marginTop: 4
    }
  }, role)));
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({
  dates,
  label,
  spots,
  onClick
}) {
  const soldOut = spots === 0;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: '#f4ede0',
      border: '1.5px solid #e5d9c4',
      borderRadius: 8,
      padding: 20,
      flex: 1,
      cursor: 'pointer',
      transition: 'box-shadow 150ms, transform 150ms'
    },
    onMouseEnter: e => {
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(28,28,24,0.12)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.boxShadow = 'none';
      e.currentTarget.style.transform = 'none';
    }
  }, /*#__PURE__*/React.createElement(Overline, null, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 48,
      color: '#111110',
      lineHeight: 0.95
    }
  }, dates), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "'Playfair Display', serif",
      fontStyle: 'italic',
      fontSize: 16,
      color: '#6b6b65',
      marginTop: 8,
      marginBottom: 14
    }
  }, "de Julho \xB7 Ponte da Barca"), soldOut ? /*#__PURE__*/React.createElement(Badge, {
    variant: "dark"
  }, "Esgotado") : /*#__PURE__*/React.createElement(Badge, {
    variant: spots < 5 ? 'bright' : 'green'
  }, spots < 5 ? `Últimos ${spots} lugares` : 'Inscrições abertas'));
}

// Export all to window for cross-script access
Object.assign(window, {
  NavBar,
  Badge,
  Btn,
  Overline,
  SectionLabel,
  CoachCard,
  SessionCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/cft_camp/Components.jsx", error: String((e && e.message) || e) }); }

})();
