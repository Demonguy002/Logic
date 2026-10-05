import React, { useEffect, useMemo, useRef, useState } from 'react'

const VARS = ['A', 'B', 'C', 'D']
const THEMES = [
  { id: 'bright', label: 'Bright', icon: '☼' },
  { id: 'dark', label: 'Purple Dark', icon: '◐' },
  { id: 'ocean', label: 'Ocean', icon: '≈' },
]
const LABS = [
  { id: 'kmap', icon: '⌗', title: 'K-Map Lab', text: '2, 3 & 4-variable maps, SOP/POS, grouping and implicant analysis.' },
  { id: 'boolean', icon: 'Σ', title: 'Boolean Algebra', text: 'Step-by-step reduction with named laws and a generated logic circuit.' },
  { id: 'gates', icon: '⊕', title: 'Logic Gate Lab', text: 'Interactive gates, input tables, outputs and gate-level circuits.' },
  { id: 'bits', icon: '01', title: 'Bit Analysis', text: 'Binary, octal, hexadecimal, ASCII, bytes and shift operations.' },
]

const GROUP_COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#22c55e', '#f43f5e', '#3b82f6', '#14b8a6', '#a855f7', '#eab308']

function uniqSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b)
}
function allCells(n) {
  return Array.from({ length: 2 ** n }, (_, i) => i)
}
function binary(value, width) {
  return Number(value).toString(2).padStart(width, '0')
}
function parseList(value, max) {
  return uniqSorted(
    String(value ?? '')
      .split(/[\s,;]+/)
      .map((x) => Number.parseInt(x, 10))
      .filter((x) => Number.isInteger(x) && x >= 0 && x < max),
  )
}
function cubeKey(cube) {
  return cube.map((x) => (x === -1 ? '-' : x)).join('')
}
function cubeLiterals(cube) {
  return cube.reduce((total, bit) => total + (bit === -1 ? 0 : 1), 0)
}
function cubeCoverage(cube) {
  return allCells(cube.length).filter((m) => {
    const bits = binary(m, cube.length)
    return cube.every((bit, index) => bit === -1 || bit === Number(bits[index]))
  })
}
function cubeToTerm(cube, mode = 'SOP', variableNames = VARS) {
  const letters = variableNames.slice(0, cube.length)
  if (mode === 'SOP') {
    const parts = cube
      .map((bit, index) => (bit === -1 ? '' : bit === 1 ? letters[index] : `${letters[index]}'`))
      .filter(Boolean)
    return parts.join('') || '1'
  }
  const parts = cube
    .map((bit, index) => (bit === -1 ? '' : bit === 0 ? letters[index] : `${letters[index]}'`))
    .filter(Boolean)
  return `(${parts.join('+') || '0'})`
}

function enumerateImplicants(n, targetSet, dontCareSet = new Set()) {
  const choices = [-1, 0, 1]
  const allCandidates = []
  function walk(index, cube) {
    if (index === n) {
      const coverage = cubeCoverage(cube)
      if (coverage.length && coverage.every((m) => targetSet.has(m) || dontCareSet.has(m))) {
        const targetCoverage = coverage.filter((m) => targetSet.has(m))
        if (targetCoverage.length) allCandidates.push({ cube: [...cube], cells: targetCoverage, allCells: coverage })
      }
      return
    }
    choices.forEach((bit) => walk(index + 1, [...cube, bit]))
  }
  walk(0, [])

  const candidates = [...new Map(allCandidates.map((x) => [cubeKey(x.cube), x])).values()]
  const primes = candidates.filter((item) => {
    return !item.cube.some((bit, index) => {
      if (bit === -1) return false
      const expanded = [...item.cube]
      expanded[index] = -1
      const expandedCoverage = cubeCoverage(expanded)
      return expandedCoverage.length && expandedCoverage.every((m) => targetSet.has(m) || dontCareSet.has(m))
    })
  })

  primes.sort((a, b) =>
    b.cells.length - a.cells.length ||
    cubeLiterals(a.cube) - cubeLiterals(b.cube) ||
    cubeKey(a.cube).localeCompare(cubeKey(b.cube)),
  )
  return { implicants: candidates, primes }
}

function cubePreference(cube) {
  const weights = Array.from({ length: cube.length }, (_, index) => 2 ** (cube.length - index))
  return cube.reduce((score, bit, index) => {
    if (bit === -1) return score
    return score + weights[index] * (bit === 1 ? 2 : 1)
  }, 0)
}

function chooseMinimalCover(target, primes) {
  const targetList = [...target]
  if (!targetList.length) return []
  const essentials = []
  for (const m of targetList) {
    const covering = primes.filter((p) => p.cells.includes(m))
    if (covering.length === 1 && !essentials.includes(covering[0])) essentials.push(covering[0])
  }

  const coveredByEssential = new Set(essentials.flatMap((p) => p.cells))
  const remaining = targetList.filter((m) => !coveredByEssential.has(m))
  if (!remaining.length) return essentials

  const candidates = primes.filter((p) => !essentials.includes(p) && p.cells.some((m) => remaining.includes(m)))
  let best = null
  const search = (start, covered, picked) => {
    if (remaining.every((m) => covered.has(m))) {
      const score = [
        picked.length,
        picked.reduce((sum, p) => sum + cubeLiterals(p.cube), 0),
        -picked.reduce((sum, p) => sum + cubePreference(p.cube), 0),
      ]
      if (
        !best ||
        score[0] < best.score[0] ||
        (score[0] === best.score[0] && score[1] < best.score[1]) ||
        (score[0] === best.score[0] && score[1] === best.score[1] && score[2] < best.score[2])
      ) {
        best = { picked: [...picked], score }
      }
      return
    }
    if (start >= candidates.length) return
    if (best && picked.length >= best.score[0]) return

    for (let i = start; i < candidates.length; i += 1) {
      const nextCovered = new Set(covered)
      candidates[i].cells.forEach((m) => nextCovered.add(m))
      search(i + 1, nextCovered, [...picked, candidates[i]])
    }
  }

  search(0, new Set(coveredByEssential), [])
  return [...essentials, ...(best?.picked || [])]
}

function getEssential(primes, target) {
  const result = []
  for (const m of target) {
    const covers = primes.filter((p) => p.cells.includes(m))
    if (covers.length === 1 && !result.includes(covers[0])) result.push(covers[0])
  }
  return result
}

function solveFunction(n, onesInput, dontCareInput = [], variableNames = VARS) {
  const all = new Set(allCells(n))
  const ones = new Set(onesInput)
  const dc = new Set([...dontCareInput].filter((m) => !ones.has(m) && all.has(m)))
  const zeros = new Set([...all].filter((m) => !ones.has(m) && !dc.has(m)))

  const sopData = enumerateImplicants(n, ones, dc)
  const posData = enumerateImplicants(n, zeros, dc)
  const sopSelected = chooseMinimalCover(ones, sopData.primes)
  const posSelected = chooseMinimalCover(zeros, posData.primes)

  const sop = ones.size === 0 ? '0' : ones.size === 2 ** n ? '1' : sopSelected.map((p) => cubeToTerm(p.cube, 'SOP', variableNames)).join(' + ')
  const pos = zeros.size === 0 ? '1' : zeros.size === 2 ** n ? '0' : posSelected.map((p) => cubeToTerm(p.cube, 'POS', variableNames)).join('')

  return {
    n,
    ones,
    zeros,
    dontCares: dc,
    sopData,
    posData,
    sopSelected,
    posSelected,
    sopEssential: getEssential(sopData.primes, ones),
    posEssential: getEssential(posData.primes, zeros),
    sop,
    pos,
  }
}

function gray(value) {
  return (value ^ (value >> 1)).toString(2)
}
function getKMapCells(n) {
  if (n === 2) {
    return [0, 1].map((a) => [0, 1].map((b) => ({
      m: a * 2 + b,
      rBits: `${a}`,
      cBits: `${b}`,
    })))
  }
  if (n === 3) {
    const cols = [0, 1, 3, 2]
    return [0, 1].map((a) => cols.map((b) => ({
      m: a * 4 + b,
      rBits: `${a}`,
      cBits: b.toString(2).padStart(2, '0'),
    })))
  }
  const grayOrder = [0, 1, 3, 2]
  return grayOrder.map((a) => grayOrder.map((b) => ({
    m: a * 4 + b,
    rBits: a.toString(2).padStart(2, '0'),
    cBits: b.toString(2).padStart(2, '0'),
  })))
}

function variablesHeader(n, names = VARS) {
  const [A, B, C, D] = names
  if (n === 2) return { row: A, col: B, rowLabels: [`${A}'`, A], colLabels: [`${B}'`, B] }
  if (n === 3) return {
    row: A,
    col: `${B}${C}`,
    rowLabels: [`${A}'`, A],
    colLabels: [`${B}'${C}'`, `${B}'${C}`, `${B}${C}`, `${B}${C}'`],
  }
  return {
    row: `${A}${B}`,
    col: `${C}${D}`,
    rowLabels: [`${A}'${B}'`, `${A}'${B}`, `${A}${B}`, `${A}${B}'`],
    colLabels: [`${C}'${D}'`, `${C}'${D}`, `${C}${D}`, `${C}${D}'`],
  }
}

function variableNamesFor(n, names = VARS) {
  return names.slice(0, n)
}

function normalizeVariableNames(names, n) {
  return Array.from({ length: n }, (_, index) => {
    const fallback = VARS[index] || String.fromCharCode(65 + index)
    const value = String(names?.[index] || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
    return value || fallback
  })
}

function groupKind(size) {
  if (size === 1) return 'SINGLE'
  if (size === 2) return 'PAIR'
  if (size === 4) return 'QUAD'
  if (size === 8) return 'OCTET'
  if (size === 16) return '16-CELL'
  return `${size}-CELL`
}

function truthRows(n, ones) {
  return allCells(n).map((m) => ({ m, bits: binary(m, n).split('').map(Number), out: ones.has(m) ? 1 : 0 }))
}
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add('is-visible')
        observer.disconnect()
      }
    }, { threshold: 0.1 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={`reveal ${className}`} style={{ '--reveal-delay': `${delay}ms` }}>{children}</div>
}

function BinaryHero({ onStart }) {
  const bits = Array.from({ length: 42 }, (_, i) => i)
  return (
    <section className="hero-showcase">
      <div className="binary-field" aria-hidden="true">
        <div className="binary-side binary-left">{bits.map((i) => <span key={i} style={{ '--i': i }}>{i % 2}</span>)}</div>
        <div className="binary-side binary-right">{bits.map((i) => <span key={i} style={{ '--i': i }}>{(i + 1) % 2}</span>)}</div>
        <div className="blast-core"><div className="blast-ring ring-a" /><div className="blast-ring ring-b" /><div className="blast-ray ray-a" /><div className="blast-ray ray-b" /><div className="blast-ray ray-c" /></div>
      </div>
      <div className="hero-copy reveal-on-load">
        <span className="hero-kicker">DIGITAL LOGIC • COMPUTER ORGANIZATION</span>
        <div className="logo-lockup"><span>LOGIC</span><strong>NOVA</strong><sup>LAB</sup></div>
        <h1>See the logic. Trace the bits. Build the circuit.</h1>
        <p>A visual simulation lab for K-maps, Boolean algebra, gates and bit-level exploration.</p>
        <button type="button" className="primary-btn hero-btn" onClick={onStart}>Enter the Simulation Lab <span>↘</span></button>
      </div>
      <div className="scroll-hint">SCROLL TO EXPLORE <span>⌄</span></div>
    </section>
  )
}

function Landing({ onStart }) {
  return (
    <main className="landing-page">
      <BinaryHero onStart={onStart} />
      <Reveal className="landing-section landing-intro" delay={80}>
        <div className="section-kicker">ONE WORKSPACE • FOUR LABS</div>
        <h2>From a minterm to a working circuit.</h2>
        <p>LogicNova connects the visual ideas behind digital logic: truth tables become K-maps, K-map groups become minimized equations, equations become circuits, and bits become representations you can inspect.</p>
        <button type="button" id="landing-start" className="primary-btn large" onClick={onStart}>Start Lab Access <span>→</span></button>
      </Reveal>
      <Reveal className="landing-section" delay={140}>
        <div className="module-grid">
          {LABS.map((lab, index) => (
            <article key={lab.id} className="module-card glass" style={{ '--delay': `${index * 90}ms` }}>
              <div className="module-top"><div className="module-icon">{lab.icon}</div><span>0{index + 1}</span></div>
              <h3>{lab.title}</h3>
              <p>{lab.text}</p>
              <span className="module-arrow">Explore module ↗</span>
            </article>
          ))}
        </div>
      </Reveal>
      <Reveal className="landing-section explain-grid" delay={160}>
        <article className="glass info-card"><span className="section-kicker">K-MAP</span><h3>Group it. Explain it. Minimize it.</h3><p>2, 3 and 4-variable maps with Gray-code layout, SOP/POS, wrap-around grouping, implicants, prime implicants, essential prime implicants and circuit output.</p></article>
        <article className="glass info-card"><span className="section-kicker">BOOLEAN</span><h3>Every law has a reason.</h3><p>Follow a symbolic reduction trace with named laws, then turn the reduced expression into a gate-level circuit.</p></article>
        <article className="glass info-card"><span className="section-kicker">BIT ANALYSIS</span><h3>Watch representation change.</h3><p>Move between decimal, binary, octal and hexadecimal, inspect bytes and ASCII, then compare shifts before and after.</p></article>
      </Reveal>
      <Reveal className="landing-cta" delay={180}>
        <div className="cta-orb" />
        <div><span className="section-kicker">READY WHEN YOU ARE</span><h2>Open the browser lab.</h2><p>No backend. No setup beyond the local frontend. Your prototype profile and theme are stored in the browser.</p></div>
        <button type="button" className="primary-btn" onClick={onStart}>Launch LogicNova ↗</button>
      </Reveal>
      <footer className="landing-footer">LogicNova • Digital Logic & Computer Organization Simulation Lab • Frontend Prototype</footer>
    </main>
  )
}

function createUserId(name) {
  const slug = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X')
  const seed = `${Date.now()}${Math.random()}`.replace(/\D/g, '').slice(-4).padStart(4, '0')
  return `LN-${slug}-${seed}`
}

function Login({ profile, onLogin }) {
  const [name, setName] = useState(profile?.name && profile.name !== 'Guest' ? profile.name : '')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('new')
  const [error, setError] = useState('')
  const existingId = profile?.id

  useEffect(() => {
    if (existingId) setMode('returning')
  }, [existingId])

  const submit = () => {
    setError('')
    if (!name.trim() || password.length < 3) return
    if (mode === 'returning' && existingId && password !== profile.password) {
      setError('That local passcode does not match this profile.')
      return
    }
    const id = mode === 'returning' && existingId ? existingId : createUserId(name.trim())
    onLogin({ name: name.trim(), password: mode === 'returning' ? profile.password : password, id })
  }

  return (
    <main className="auth-screen">
      <div className="auth-bg-grid" />
      <div className="auth-glow glow-a" /><div className="auth-glow glow-b" />
      <section className="auth-card glass">
        <div className="brand-lockup"><span className="brand-mark">LN</span><div><b>LogicNova</b><small>Simulation Lab</small></div></div>
        <span className="section-kicker">{mode === 'new' ? 'CREATE LAB PROFILE' : 'RETURNING PROFILE'}</span>
        <h1>{mode === 'new' ? 'Name your workspace.' : `Welcome back, ${profile?.name || 'learner'}.`}</h1>
        <p>{mode === 'new' ? 'Your name and a generated Lab ID stay on this device.' : 'Enter the local passcode to reopen your browser workspace.'}</p>
        <div className="auth-fields">
          <label>Username / Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anirudha" autoComplete="username" /></label>
          {mode === 'returning' && <div className="id-preview"><span>YOUR LAB ID</span><b>{existingId}</b></div>}
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 3 characters" type="password" autoComplete="current-password" /></label>
        </div>
        {error && <div className="error-box auth-error">{error}</div>}
        <button className="primary-btn full" disabled={!name.trim() || password.length < 3} onClick={submit}>{mode === 'new' ? 'Create & Open Dashboard →' : 'Open Dashboard →'}</button>
        <button className="text-btn" onClick={() => setMode((current) => current === 'new' ? 'returning' : 'new')}>{mode === 'new' && existingId ? 'Use my existing profile instead' : 'Create a fresh local profile'}</button>
        <small className="muted">Prototype authentication is local browser storage only. It is not production security.</small>
      </section>
    </main>
  )
}

function Sidebar({ active, setActive, profile, theme, setTheme, logout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <>
      <div className="mobile-topbar glass">
        <div className="brand-lockup"><span className="brand-mark">LN</span><div><b>LogicNova</b><small>{profile.name}</small></div></div>
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen((x) => !x)} aria-label="Toggle navigation">☰</button>
      </div>
      <aside className={`sidebar glass ${menuOpen ? 'mobile-open' : ''}`}>
        <div className="brand-lockup sidebar-brand"><span className="brand-mark">LN</span><div><b>LogicNova</b><small>Digital Logic Lab</small></div></div>
        <div className="nav-label">LABS</div>
        <nav>
          {LABS.map((lab) => <button key={lab.id} className={`nav-btn ${active === lab.id ? 'active' : ''}`} onClick={() => { setActive(lab.id); setMenuOpen(false) }}><span>{lab.icon}</span><em>{lab.title}</em></button>)}
        </nav>
        <div className="nav-label">ACCOUNT</div>
        <button className={`nav-btn ${active === 'profile' ? 'active' : ''}`} onClick={() => { setActive('profile'); setMenuOpen(false) }}><span>◉</span><em>Profile</em></button>
        <div className="sidebar-bottom">
          <div className="theme-row">
            {THEMES.map((item) => <button key={item.id} className={`theme-chip ${theme === item.id ? 'active' : ''}`} onClick={() => setTheme(item.id)} title={`${item.label} theme`}>{item.icon}<span>{item.label}</span></button>)}
          </div>
          <div className="profile-mini"><div className="avatar">{profile.name[0]?.toUpperCase() || '?'}</div><div className="profile-mini-copy"><b>{profile.name}</b><small>{profile.id || 'Local profile'}</small></div><button className="icon-btn" title="Log out" onClick={logout}>↪</button></div>
        </div>
      </aside>
    </>
  )
}

function Dashboard({ profile, active, setActive, theme, setTheme, logout, setLabHistory }) {
  const activeLab = active === 'profile' ? null : LABS.find((lab) => lab.id === active)
  return (
    <div className="app-shell">
      <Sidebar {...{ active, setActive, profile, theme, setTheme, logout }} />
      <main className="workspace">
        <header className="topbar">
          <div><span className="section-kicker">SIMULATION WORKSPACE</span><h1>{activeLab?.title || 'Your Profile'}</h1></div>
          <div className="topbar-right"><span className="status-dot" /> Browser-ready <span className="divider" /> {profile.id}</div>
        </header>
        {active === 'kmap' && <KMapLab onUse={setLabHistory} />}
        {active === 'boolean' && <BooleanLab onUse={setLabHistory} />}
        {active === 'gates' && <GateLab onUse={setLabHistory} />}
        {active === 'bits' && <BitLab onUse={setLabHistory} />}
        {active === 'profile' && <ProfileLab profile={profile} history={profile.history || []} theme={theme} />}
      </main>
    </div>
  )
}

function groupSegments(group, rows) {
  const position = new Map()
  rows.forEach((row, r) => row.forEach((cell, c) => position.set(cell.m, { r, c })))
  const cells = [...new Set(group.allCells || group.cells)].filter((m) => position.has(m))
  const remaining = new Set(cells)
  const segments = []

  while (remaining.size) {
    const [seed] = remaining
    const queue = [seed]
    const component = []
    remaining.delete(seed)

    while (queue.length) {
      const current = queue.shift()
      component.push(current)
      const p = position.get(current)
      const neighbors = []
      for (const candidate of remaining) {
        const q = position.get(candidate)
        const sameRow = p.r === q.r && Math.abs(p.c - q.c) === 1
        const sameCol = p.c === q.c && Math.abs(p.r - q.r) === 1
        if (sameRow || sameCol) neighbors.push(candidate)
      }
      neighbors.forEach((m) => {
        remaining.delete(m)
        queue.push(m)
      })
    }

    const points = component.map((m) => position.get(m))
    segments.push({
      r1: Math.min(...points.map((p) => p.r)),
      r2: Math.max(...points.map((p) => p.r)),
      c1: Math.min(...points.map((p) => p.c)),
      c2: Math.max(...points.map((p) => p.c)),
      cells: component,
    })
  }
  return segments
}

function KMapGrid({ n, result, focus, header, variableNames }) {
  const rows = getKMapCells(n)
  const entries = focus === 'sop'
    ? result.sopSelected.map((group, index) => ({ group, index, mode: 'SOP' }))
    : focus === 'pos'
      ? result.posSelected.map((group, index) => ({ group, index, mode: 'POS' }))
      : [
          ...result.sopSelected.map((group, index) => ({ group, index, mode: 'SOP' })),
          ...result.posSelected.map((group, index) => ({ group, index: index + result.sopSelected.length, mode: 'POS' })),
        ]

  const groups = entries.map((entry) => ({
    ...entry,
    segments: groupSegments(entry.group, rows),
    colorIndex: entry.mode === 'POS'
      ? (entry.index + 5) % GROUP_COLORS.length
      : entry.index % GROUP_COLORS.length,
  }))

  return (
    <div className="kmap-wrap">
      <div className="kmap-axis"><span>↓ {header.row}</span><span>→ {header.col}</span></div>
      <div className="kmap-visual">
        <div className={`kmap-grid grid-${n}`} style={{ '--map-cols': rows[0].length }}>
          <div className="kmap-corner">{header.row} \ {header.col}</div>
          {header.colLabels.map((label) => <div key={label} className="kmap-label col-label">{label}</div>)}
          {rows.map((row, rowIndex) => (
            <React.Fragment key={rowIndex}>
              <div className="kmap-label row-label">{header.rowLabels[rowIndex]}</div>
              {row.map((cell) => {
                const one = result.ones.has(cell.m)
                const zero = result.zeros.has(cell.m)
                const dc = result.dontCares.has(cell.m)
                const visibleValue = focus === 'sop'
                  ? (one ? '1' : dc ? 'X' : '')
                  : focus === 'pos'
                    ? (zero ? '0' : dc ? 'X' : '')
                    : (dc ? 'X' : one ? '1' : '0')
                const cellState = dc
                  ? 'dont-care'
                  : focus === 'sop'
                    ? (one ? 'one' : 'blank')
                    : focus === 'pos'
                      ? (zero ? 'zero' : 'blank')
                      : one
                        ? 'one'
                        : zero
                          ? 'zero'
                          : 'blank'
                return (
                  <div key={cell.m} className={`kmap-cell ${cellState}`}>
                    <span className="cell-coords">{cell.rBits} · {cell.cBits}</span>
                    <strong>{visibleValue}</strong>
                    <small>m{cell.m}</small>
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>

        <div className={`group-overlay-grid grid-${n}`} style={{ '--map-cols': rows[0].length }} aria-hidden="true">
          {groups.flatMap((entry) => entry.segments.map((segment, segmentIndex) => (
            <div
              key={`${entry.mode}-${entry.index}-${segmentIndex}`}
              className={`group-loop ${groupKind(entry.group.cells.length).toLowerCase()} ${entry.segments.length > 1 ? 'wrap-segment' : ''}`}
              style={{
                '--group-color': GROUP_COLORS[entry.colorIndex],
                gridColumn: `${segment.c1 + 2} / ${segment.c2 + 3}`,
                gridRow: `${segment.r1 + 2} / ${segment.r2 + 3}`,
                '--loop-radius': segment.r1 === segment.r2 && segment.c1 === segment.c2 ? '999px' : groupKind(entry.group.cells.length) === 'PAIR' ? '999px' : '20px',
              }}
            >
              {segmentIndex === 0 && <span>{entry.mode} · G{entry.index + 1}</span>}
            </div>
          )))}
        </div>
      </div>

      <div className="kmap-legend">
        <span><i className="legend-dot one-dot" />1 / SOP</span>
        <span><i className="legend-dot zero-dot" />0 / POS</span>
        <span><i className="legend-dot dc-dot" />X / Don't-care</span>
        <span><i className="legend-outline textbook-outline" />Textbook-style loops</span>
      </div>
      <div className="group-summary">
        {groups.map((entry) => (
          <span key={`${entry.mode}-${entry.index}-${cubeKey(entry.group.cube)}`}>
            <i style={{ background: GROUP_COLORS[entry.colorIndex] }} />
            {entry.mode} • G{entry.index + 1} • {groupKind(entry.group.cells.length)} → {cubeToTerm(entry.group.cube, entry.mode, variableNames)}
            {entry.segments.length > 1 ? ' • wrap' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function KMapLab({ onUse }) {
  const [n, setN] = useState(4)
  const [inputType, setInputType] = useState('minterms')
  const [value, setValue] = useState('0,1,2,3,4,5,6,7')
  const [dontCare, setDontCare] = useState('')
  const [focus, setFocus] = useState('sop')
  const [variableNames, setVariableNames] = useState(['A', 'B', 'C', 'D'])
  const [result, setResult] = useState(() => solveFunction(4, [0, 1, 2, 3, 4, 5, 6, 7]))
  const [pulse, setPulse] = useState(false)
  const max = 2 ** n
  const activeVariableNames = normalizeVariableNames(variableNames, n)
  const header = variablesHeader(n, activeVariableNames)

  const analyze = () => {
    const entered = parseList(value, max)
    const dc = parseList(dontCare, max)
    const ones = inputType === 'minterms' ? entered : allCells(n).filter((m) => !entered.includes(m))
    const cleanedOnes = ones.filter((m) => !dc.includes(m))
    setResult(solveFunction(n, cleanedOnes, dc, activeVariableNames))
    onUse?.('K-Map Lab')
    setPulse(true)
    window.setTimeout(() => setPulse(false), 450)
  }

  const changeN = (next) => {
    setN(next)
    const defaults = { 2: '0,1,3', 3: '1,3,5,7', 4: '0,1,2,3,4,5,6,7' }
    setValue(defaults[next])
    setDontCare('')
  }

  const updateVariable = (index, raw) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
    setVariableNames((current) => current.map((name, itemIndex) => itemIndex === index ? cleaned : name))
  }

  return (
    <div className="lab-page">
      <Reveal><section className="hero-panel glass"><div><span className="section-kicker">VISUAL MINIMIZATION ENGINE</span><h2>Build the map. Watch the textbook loops.</h2><p>Enter minterms or maxterms once. SOP groups the 1-cells, POS groups the 0-cells, and Both shows both analyses on the same K-map. Variable labels are editable.</p></div><div className="stat-chip"><b>{n}</b><span>VARIABLE K-MAP</span></div></section></Reveal>
      <Reveal delay={40}><section className="control-panel glass">
        <div className="control-group"><label>Variables</label><div className="segmented">{[2, 3, 4].map((x) => <button key={x} className={n === x ? 'active' : ''} onClick={() => changeN(x)}>{x}-Var</button>)}</div></div>
        <div className="control-group"><label>Entered terms</label><div className="segmented"><button className={inputType === 'minterms' ? 'active' : ''} onClick={() => { setInputType('minterms'); setFocus('sop') }}>Minterms Σm</button><button className={inputType === 'maxterms' ? 'active' : ''} onClick={() => { setInputType('maxterms'); setFocus('pos') }}>Maxterms ΠM</button></div></div>
        <div className="control-group variable-name-group"><label>Variable names</label><div className="variable-name-row">{variableNames.slice(0, n).map((name, index) => <input key={index} maxLength={1} value={name} aria-label={`Variable ${index + 1}`} onChange={(e) => updateVariable(index, e.target.value)} placeholder={`V${index + 1}`} />)}</div></div>
        <label className="wide-field">{inputType === 'minterms' ? 'Minterms' : 'Maxterms'}<input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0, 1, 3, 7" /></label>
        <label className="wide-field">Don't-care terms <input value={dontCare} onChange={(e) => setDontCare(e.target.value)} placeholder="Optional: 8, 9" /></label>
        <button className={`primary-btn ${pulse ? 'pulse' : ''}`} onClick={analyze}>Run K-Map Analysis ↗</button>
      </section></Reveal>

      <div className="two-col">
        <Reveal><section className="panel"><div className="panel-head"><div><span className="section-kicker">K-MAP MATRIX</span><h3>{n}-Variable K-map</h3></div><div className="focus-tabs"><button className={focus === 'sop' ? 'active' : ''} onClick={() => setFocus('sop')}>1s / SOP</button><button className={focus === 'pos' ? 'active' : ''} onClick={() => setFocus('pos')}>0s / POS</button><button className={focus === 'both' ? 'active' : ''} onClick={() => setFocus('both')}>Both</button></div></div><KMapGrid n={n} result={result} focus={focus} header={header} variableNames={variableNames} /></section></Reveal>
        <Reveal delay={60}><section className="panel result-panel"><div className="panel-head"><div><span className="section-kicker">SAME FUNCTION • TWO FORMS</span><h3>Reduced result</h3></div><span className="tag">Automatic</span></div>
          <div className="equation-stack">
            <div className="equation-card sop-card"><small>SOP • GROUP THE 1s</small><code>F = {result.sop || '0'}</code><button className="secondary-btn" onClick={() => setFocus('sop')}>Show SOP groups ↗</button></div>
            <div className="equation-card pos-card"><small>POS • GROUP THE 0s OF THE SAME K-MAP</small><code>F = {result.pos || '1'}</code><button className="secondary-btn" onClick={() => setFocus('pos')}>Show POS groups ↗</button></div>
          </div>
          <div className="micro-stats"><div><b>{result.ones.size}</b><span>1-CELLS</span></div><div><b>{result.zeros.size}</b><span>0-CELLS</span></div><div><b>{result.sopSelected.length}</b><span>SOP GROUPS</span></div><div><b>{result.posSelected.length}</b><span>POS GROUPS</span></div></div>
          <div className="result-actions"><button className="secondary-btn" onClick={() => setFocus('both')}>Compare SOP + POS ↗</button></div>
        </section></Reveal>
      </div>

      <Reveal delay={30}><section className="panel"><div className="panel-head"><div><span className="section-kicker">IMPLICANT ANALYSIS</span><h3>Implicants → prime → essential</h3></div><span className="tag">Coverage-aware</span></div><div className="analysis-grid">
        <ImplicantColumn title="SOP implicants" data={result.sopData} selected={result.sopSelected} essential={result.sopEssential} mode="SOP" variableNames={activeVariableNames} />
        <ImplicantColumn title="POS zero-groups" data={result.posData} selected={result.posSelected} essential={result.posEssential} mode="POS" variableNames={activeVariableNames} />
      </div></section></Reveal>

      <Reveal delay={50}><section className="panel"><div className="panel-head"><div><span className="section-kicker">TRUTH TABLE</span><h3>Every input combination</h3></div><span className="tag">Minterm order = binary value</span></div><div className="truth-scroll"><table><thead><tr>{variableNamesFor(n, variableNames).map((v) => <th key={v}>{v}</th>)}<th>m</th><th>F</th></tr></thead><tbody>{truthRows(n, result.ones).map((row) => <tr key={row.m}>{row.bits.map((bit, index) => <td key={index}>{bit}</td>)}<td>m{row.m}</td><td className={row.out ? 'truth-one' : 'truth-zero'}>{row.out}</td></tr>)}</tbody></table></div></section></Reveal>

      <Reveal delay={60}><ResultCircuit expression={result.sop} title="K-Map → SOP Logic Circuit" subtitle={`Reduced SOP implementation using ${variableNames.slice(0, n).join(', ')}`} /></Reveal>
      <Reveal delay={80}><ResultCircuit expression={result.pos} title="K-Map → POS Logic Circuit" subtitle={`Reduced POS implementation using ${variableNames.slice(0, n).join(', ')}`} /></Reveal>
      <Reveal delay={90}><section className="panel"><div className="panel-head"><div><span className="section-kicker">BOOLEAN CROSS-CHECK</span><h3>What the groups mean algebraically</h3></div></div><KMapVerification result={result} variableNames={variableNames} /></section></Reveal>
    </div>
  )
}

function ImplicantColumn({ title, data, selected, essential, mode, variableNames = VARS }) {
  const selectedKeys = new Set(selected.map((p) => cubeKey(p.cube)))
  const essentialKeys = new Set(essential.map((p) => cubeKey(p.cube)))
  const primes = data.primes.slice(0, 20)
  return (
    <div className="analysis-col">
      <div className="analysis-title"><h4>{title}</h4><span>{data.implicants.length} implicants • {data.primes.length} primes</span></div>
      {primes.length === 0 ? <div className="empty-note">No groups are needed for this constant function.</div> : <div className="implicant-list">{primes.map((p, index) => {
        const key = cubeKey(p.cube)
        const role = essentialKeys.has(key) ? 'EPI' : selectedKeys.has(key) ? 'SELECTED' : 'PI'
        return <div key={key} className={`imp-row ${selectedKeys.has(key) ? 'selected' : ''} ${essentialKeys.has(key) ? 'essential' : ''}`}><span>{role} {index + 1}</span><code>{cubeToTerm(p.cube, mode, variableNames)}</code><small>{p.cells.map((m) => `m${m}`).join(', ')}</small></div>
      })}</div>}
      <div className="callout"><b>{mode === 'SOP' ? 'Essential prime implicant' : 'Essential POS group'}</b><p>Chosen when a required 1-cell or 0-cell has exactly one covering prime group. Selected groups then minimize terms and literals.</p></div>
    </div>
  )
}

function KMapVerification({ result, variableNames = VARS }) {
  const steps = result.sopSelected.map((p, index) => <div key={cubeKey(p.cube)} className="verify-step"><span>{String(index + 2).padStart(2, '0')}</span><p><b>Group {index + 1}:</b> {p.cells.map((m) => `m${m}`).join(', ')} keeps only constant variables → <code>{cubeToTerm(p.cube, 'SOP', variableNames)}</code>.</p></div>)
  return <div className="verification-list"><div className="verify-step"><span>01</span><p><b>Start with the selected SOP groups.</b><br />Variables that change inside a group disappear. Variables that remain constant stay in the product term.</p></div>{steps}<div className="verify-step final"><span>✓</span><p><b>Combine SOP products with OR.</b><br />Reduced SOP: <code>{result.sop}</code></p></div><div className="verify-step final"><span>✓</span><p><b>For POS, group the 0-cells of the same function.</b><br />Reduced POS: <code>{result.pos}</code></p></div><div className="law-strip"><span>COMPLEMENT</span><span>ABSORPTION</span><span>IDENTITY</span><span>DISTRIBUTIVE</span><span>DE MORGAN</span></div></div>
}

function parseExpression(raw) {
  let source = String(raw || '').trim().replace(/\s+/g, '')
    .replace(/∨/g, '+').replace(/∧/g, '*').replace(/·/g, '*').replace(/⋅/g, '*').replace(/¬/g, '!')
  source = source.replace(/([A-Za-z01\)'])(?=[A-Za-z01\(!])/g, '$1*')
  const tokens = source.split('').map((char) => char.toUpperCase() === char && char >= 'A' && char <= 'D' ? char : char.toUpperCase() === char ? char : char.toUpperCase())
  let index = 0
  const peek = () => tokens[index]
  const take = () => tokens[index++]

  function primary() {
    const token = take()
    if (token === '(') {
      const node = orExpr()
      if (take() !== ')') throw new Error('Missing closing parenthesis.')
      return node
    }
    if (/^[A-Z]$/.test(token)) return { type: 'var', name: token }
    if (token === '0' || token === '1') return { type: 'const', value: Number(token) }
    throw new Error('Use single-letter variables A–Z with +, *, parentheses and apostrophe for NOT.')
  }
  function postfix() {
    let node = primary()
    while (peek() === "'" || peek() === '!') {
      take(); node = { type: 'not', child: node }
    }
    return node
  }
  function andExpr() {
    let node = postfix()
    while (peek() === '*') {
      take(); node = { type: 'and', children: [node, postfix()] }
    }
    return node
  }
  function orExpr() {
    let node = andExpr()
    while (peek() === '+') {
      take(); node = { type: 'or', children: [node, andExpr()] }
    }
    return node
  }
  const ast = orExpr()
  if (index < tokens.length) throw new Error(`Unexpected token “${tokens[index]}”.`)
  return ast
}

function astEquals(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
function flatten(type, children) { return children.flatMap((child) => child.type === type ? child.children : [child]) }
function containsNegationPair(children) {
  for (const child of children) {
    if (child.type === 'not' && children.some((other) => astEquals(other, child.child))) return true
  }
  return false
}
function simplifyAst(node) {
  if (!node || node.type === 'var' || node.type === 'const') return { node, law: null, changed: false }
  if (node.type === 'not') {
    const child = simplifyAst(node.child).node
    if (child.type === 'const') return { node: { type: 'const', value: child.value ? 0 : 1 }, law: 'Complement / constant evaluation', changed: true }
    if (child.type === 'not') return { node: child.child, law: 'Involution Law', changed: true }
    if (child.type === 'and' || child.type === 'or') return { node: { type: child.type === 'and' ? 'or' : 'and', children: child.children.map((x) => ({ type: 'not', child: x })) }, law: "De Morgan's Law", changed: true }
    return { node: { type: 'not', child }, law: null, changed: !astEquals(child, node.child) }
  }

  const childResults = node.children.map(simplifyAst)
  let children = childResults.map((r) => r.node)
  const childChanged = childResults.some((r) => r.changed)
  if (childChanged) {
    const changedChild = childResults.find((r) => r.changed)
    return {
      node: { type: node.type, children },
      law: changedChild?.law || 'Boolean simplification',
      changed: true,
    }
  }
  children = flatten(node.type, children)
  if (children.length !== node.children.length) return { node: { type: node.type, children }, law: 'Associative Law', changed: true }

  const unique = []
  children.forEach((child) => { if (!unique.some((u) => astEquals(u, child))) unique.push(child) })
  if (unique.length !== children.length) return { node: { type: node.type, children: unique }, law: 'Idempotent Law', changed: true }

  if (containsNegationPair(unique)) return { node: { type: 'const', value: node.type === 'or' ? 1 : 0 }, law: 'Complement Law', changed: true }
  if (unique.some((child) => child.type === 'const' && child.value === (node.type === 'and' ? 0 : 1))) return { node: { type: 'const', value: node.type === 'and' ? 0 : 1 }, law: 'Null / Domination Law', changed: true }
  const identity = node.type === 'and' ? 1 : 0
  if (unique.some((child) => child.type === 'const' && child.value === identity)) {
    const rest = unique.filter((child) => !(child.type === 'const' && child.value === identity))
    return { node: rest.length === 1 ? rest[0] : { type: node.type, children: rest }, law: 'Identity Law', changed: true }
  }

  if (node.type === 'or') {
    for (const left of unique) {
      for (const right of unique) {
        if (right.type === 'and' && right.children.some((part) => astEquals(part, left))) return { node: left, law: 'Absorption Law', changed: true }
      }
    }
    // A + A'B = A + B (derived absorption form).
    for (const plain of unique) {
      for (const product of unique.filter((item) => item.type === 'and')) {
        const hasComplement = product.children.some((part) => part.type === 'not' && astEquals(part.child, plain))
        if (hasComplement) {
          const remainder = product.children.filter((part) => !(part.type === 'not' && astEquals(part.child, plain)))
          if (remainder.length) {
            const rhs = remainder.length === 1 ? remainder[0] : { type: 'and', children: remainder }
            return { node: { type: 'or', children: [plain, rhs] }, law: "Absorption Law (A + A'B = A + B)", changed: true }
          }
        }
      }
    }
    if (unique.length === 2 && unique.every((item) => item.type === 'and')) {
      const [a, b] = unique
      const common = a.children.find((x) => b.children.some((y) => astEquals(x, y)))
      if (common) {
        const ra = a.children.find((x) => !astEquals(x, common))
        const rb = b.children.find((x) => !astEquals(x, common))
        if (ra && rb && ((ra.type === 'not' && astEquals(ra.child, rb)) || (rb.type === 'not' && astEquals(rb.child, ra)))) {
          return { node: { type: 'and', children: [common, { type: 'or', children: [ra, rb] }] }, law: 'Distributive Law (factoring)', changed: true }
        }
      }
    }
  }
  if (node.type === 'and') {
    const plain = unique.find((x) => x.type !== 'or')
    const grouped = unique.find((x) => x.type === 'or')
    if (plain && grouped && grouped.children.some((x) => astEquals(x, plain))) return { node: plain, law: 'Absorption Law', changed: true }
    // Distribute a product over a sum so the same engine can continue with absorption/idempotence.
    const orChild = unique.find((x) => x.type === 'or')
    if (orChild) {
      const otherFactors = unique.filter((x) => x !== orChild)
      const products = orChild.children.map((term) => {
        const factors = [...otherFactors, term]
        return factors.length === 1 ? factors[0] : { type: 'and', children: factors }
      })
      return { node: { type: 'or', children: products }, law: 'Distributive Law', changed: true }
    }
  }
  return { node: { type: node.type, children }, law: childChanged ? (childResults.find((r) => r.changed)?.law || 'Boolean simplification') : null, changed: childChanged }
}

function astToText(node, parent = null) {
  if (!node) return ''
  if (node.type === 'var') return node.name
  if (node.type === 'const') return String(node.value)
  if (node.type === 'not') {
    const inner = astToText(node.child, 'not')
    return node.child.type === 'var' || node.child.type === 'const' ? `${inner}'` : `(${inner})'`
  }
  const isAnd = node.type === 'and'
  const joiner = isAnd ? '' : ' + '
  const joined = node.children.map((child) => astToText(child, node.type)).join(joiner)
  if (isAnd && node.children.some((child) => child.type === 'or')) return `(${joined})`
  if (!isAnd && parent === 'and') return `(${joined})`
  return joined
}

function booleanSteps(expression) {
  try {
    let current = parseExpression(expression)
    const steps = [{ text: astToText(current), law: 'Given Expression' }]
    for (let i = 0; i < 18; i += 1) {
      const next = simplifyAst(current)
      if (!next.changed || astEquals(next.node, current)) break
      current = next.node
      steps.push({ text: astToText(current), law: next.law || 'Boolean simplification' })
    }
    return { steps, final: astToText(current), ast: current }
  } catch (error) {
    return { error: error.message, steps: [] }
  }
}

function ResultCircuit({ expression, title, subtitle }) {
  const safeExpression = expression || '0'
  const ast = useMemo(() => {
    try { return parseExpression(safeExpression) } catch { return { type: 'const', value: 0 } }
  }, [safeExpression])
  return <section className="panel circuit-panel"><div className="panel-head"><div><span className="section-kicker">CIRCUIT OUTPUT</span><h3>{title}</h3><p className="panel-subtitle">{subtitle}</p></div><span className="tag">Auto-designed</span></div><CircuitDiagram ast={ast} expression={safeExpression} /></section>
}

function circuitMetrics(node) {
  if (node.type === 'var' || node.type === 'const') return { depth: 0, leaves: 1 }
  const children = node.type === 'not' ? [node.child] : node.children
  const parts = children.map(circuitMetrics)
  return { depth: 1 + Math.max(...parts.map((p) => p.depth), 0), leaves: parts.reduce((sum, p) => sum + p.leaves, 0) }
}
function GateShape({ kind, x, y, label }) {
  const y0 = y + 20
  if (kind === 'NOT') {
    return <g transform={`translate(${x},${y})`}><path className="gate-svg-shape" d="M0,4 L0,42 L54,23 Z" /><circle className="gate-bubble" cx="58" cy="23" r="4" /><text x="27" y="27" textAnchor="middle">NOT</text></g>
  }
  if (kind === 'AND' || kind === 'NAND') {
    return <g transform={`translate(${x},${y})`}><path className="gate-svg-shape" d="M0,4 L25,4 A26,19 0 0 1 25,42 L0,42 Z" /><text x="22" y="27" textAnchor="middle">{kind}</text>{kind === 'NAND' && <circle className="gate-bubble" cx="53" cy="23" r="4" />}</g>
  }
  return <g transform={`translate(${x},${y})`}><path className="gate-svg-shape" d="M0,4 Q25,23 0,42 Q22,42 58,23 Q22,4 0,4 Z" /><text x="25" y="27" textAnchor="middle">{label || kind}</text></g>
}

function CircuitDiagram({ ast, expression }) {
  const { depth, leaves } = circuitMetrics(ast)
  const width = Math.max(760, 130 + depth * 145)
  const height = Math.max(220, 60 + leaves * 70)
  const nodes = []
  const edges = []
  let leafIndex = 0
  const place = (node, depthIndex) => {
    const x = 40 + depthIndex * 145
    if (node.type === 'var' || node.type === 'const') {
      const y = 20 + leafIndex * 70
      leafIndex += 1
      const out = { node, x, y, kind: 'IN', cx: x + 34, cy: y + 23 }
      nodes.push(out)
      return out
    }
    const children = node.type === 'not' ? [node.child] : node.children
    const kids = children.map((child) => place(child, depthIndex - 1))
    const y = kids.reduce((sum, kid) => sum + kid.y, 0) / kids.length
    const kind = node.type === 'not' ? 'NOT' : node.type === 'and' ? 'AND' : 'OR'
    const out = { node, x, y, kind, cx: x + 58, cy: y + 23 }
    nodes.push(out)
    kids.forEach((kid) => edges.push({ x1: kid.cx, y1: kid.cy, x2: x, y2: y + 23 }))
    return out
  }
  place(ast, depth)
  return <div className="circuit-canvas"><div className="circuit-formula">F = {expression}</div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Logic circuit for ${expression}`}>
    {edges.map((edge, i) => <line key={i} className="wire" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />)}
    {nodes.map((node, i) => node.kind === 'IN' ? <g key={i} transform={`translate(${node.x},${node.y})`}><rect className="input-node" width="68" height="46" rx="12" /><text x="34" y="29" textAnchor="middle">{node.node.type === 'const' ? node.node.value : node.node.name}</text></g> : <GateShape key={i} kind={node.kind} x={node.x} y={node.y} label={node.kind} />)}
    <text x={width - 30} y={height / 2 + 5} textAnchor="end" className="output-label">F</text>
  </svg></div>
}

function BooleanLab({ onUse }) {
  const [expression, setExpression] = useState("AB + AB'")
  const [result, setResult] = useState(() => booleanSteps("AB + AB'"))
  const analyze = () => { setResult(booleanSteps(expression)); onUse?.('Boolean Algebra Lab') }
  return (
    <div className="lab-page">
      <Reveal><section className="hero-panel glass"><div><span className="section-kicker">SYMBOLIC REDUCTION ENGINE</span><h2>Make every Boolean law visible.</h2><p>Type any single-letter variables such as A, B, C, D, X, Y or Z with +, *, adjacency, parentheses and apostrophe for NOT. The simplified expression is immediately used to design the logic circuit.</p></div><div className="formula-pulse"><span>A</span><i>+</i><span>A'</span><b>→</b><em>1</em></div></section></Reveal>
      <Reveal delay={40}><section className="control-panel glass boolean-input"><label className="wide-field">Boolean expression<input value={expression} onChange={(e) => setExpression(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && analyze()} /></label><div className="input-hint">Variables detected: {[...new Set((expression.match(/[A-Za-z]/g) || []).map((v) => v.toUpperCase()))].join(' • ') || '—'}</div><button className="primary-btn" onClick={analyze}>Analyze & Reduce ↗</button></section></Reveal>
      <div className="two-col">
        <Reveal><section className="panel"><div className="panel-head"><div><span className="section-kicker">STEP-BY-STEP ANALYSIS</span><h3>Boolean algebra trace</h3></div><span className="tag">Named laws</span></div>{result.error ? <div className="error-box">{result.error}</div> : <div className="steps-list">{result.steps.map((step, index) => <div key={`${index}-${step.text}`} className={`algebra-step ${index === result.steps.length - 1 ? 'final' : ''}`}><span className="step-no">{String(index + 1).padStart(2, '0')}</span><div><small>{step.law}</small><code>{step.text}</code></div></div>)}</div>}</section></Reveal>
        <Reveal delay={60}><section className="panel"><div className="panel-head"><div><span className="section-kicker">LAW REFERENCE</span><h3>Rules available in the walkthrough</h3></div></div><div className="law-grid">{[['Identity', 'A+0=A • A·1=A'], ['Null', 'A+1=1 • A·0=0'], ['Complement', "A+A'=1 • A·A'=0"], ['Idempotent', 'A+A=A • A·A=A'], ['Absorption', 'A+AB=A • A(A+B)=A'], ['Involution', "(A')'=A"], ['De Morgan', "(A+B)'=A'B' • (AB)'=A'+B'"], ['Distributive', 'A(B+C)=AB+AC']].map(([name, formula]) => <div key={name}><b>{name} Law</b><code>{formula}</code></div>)}</div></section></Reveal>
      </div>
      {!result.error && <Reveal delay={80}><ResultCircuit expression={result.final} title="Boolean Algebra → Logic Circuit" subtitle="Built from the reduced expression" /></Reveal>}
    </div>
  )
}

const GATES = {
  AND: { inputs: 2, expression: 'A·B', truth: (a, b) => a & b },
  OR: { inputs: 2, expression: 'A+B', truth: (a, b) => a | b },
  NOT: { inputs: 1, expression: "A'", truth: (a) => (a ? 0 : 1) },
  NAND: { inputs: 2, expression: "(A·B)'", truth: (a, b) => 1 - (a & b) },
  NOR: { inputs: 2, expression: "(A+B)'", truth: (a, b) => 1 - (a | b) },
  XOR: { inputs: 2, expression: "A'B+AB'", truth: (a, b) => a ^ b },
  XNOR: { inputs: 2, expression: "AB+A'B'", truth: (a, b) => (a ^ b) ^ 1 },
}
function GateSymbol({ gate }) {
  return <div className={`gate-visual gate-${gate.toLowerCase()}`}><span>{gate}</span></div>
}
function ToggleBit({ label, value, onChange }) {
  return <button className={`bit-toggle ${value ? 'on' : ''}`} onClick={() => onChange(value ? 0 : 1)}><span>{label}</span><b>{value}</b></button>
}
function GateLab({ onUse }) {
  const [gate, setGate] = useState('AND')
  const [a, setA] = useState(1)
  const [b, setB] = useState(0)
  const info = GATES[gate]
  const output = info.inputs === 1 ? info.truth(a) : info.truth(a, b)
  const rows = info.inputs === 1 ? [[0, info.truth(0)], [1, info.truth(1)]] : [[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => [x, y, info.truth(x, y)])
  useEffect(() => onUse?.('Logic Gate Lab'), [gate])
  return (
    <div className="lab-page">
      <Reveal><section className="hero-panel glass"><div><span className="section-kicker">INTERACTIVE GATE BENCH</span><h2>Flip an input. Watch the output react.</h2><p>Each gate has an entered-input table, a live gate view, a truth table and a circuit representation.</p></div><div className="gate-big"><GateSymbol gate={gate} /></div></section></Reveal>
      <Reveal delay={40}><div className="gate-selector">{Object.keys(GATES).map((name) => <button key={name} className={gate === name ? 'active' : ''} onClick={() => setGate(name)}>{name}</button>)}</div></Reveal>
      <div className="two-col">
        <Reveal><section className="panel gate-interactive"><div className="panel-head"><div><span className="section-kicker">LIVE GATE TABLE</span><h3>{gate} gate</h3></div><span className="tag">{info.expression}</span></div><div className="input-toggles"><ToggleBit label="A" value={a} onChange={setA} />{info.inputs === 2 && <ToggleBit label="B" value={b} onChange={setB} />}</div><div className="gate-stage"><div className="wire-in"><span>A = <b>{a}</b></span>{info.inputs === 2 && <span>B = <b>{b}</b></span>}</div><GateSymbol gate={gate} /><div className="wire-out"><small>OUTPUT</small><b>{output}</b></div></div></section></Reveal>
        <Reveal delay={60}><section className="panel"><div className="panel-head"><div><span className="section-kicker">TRUTH TABLE</span><h3>{gate}</h3></div></div><div className="truth-scroll"><table><thead><tr>{info.inputs === 2 && <><th>A</th><th>B</th></>}<th>OUT</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.slice(0, -1).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}<td className={row[row.length - 1] ? 'truth-one' : 'truth-zero'}>{row[row.length - 1]}</td></tr>)}</tbody></table></div><div className="entered-row"><div><small>ENTERED INPUTS</small><b>{info.inputs === 2 ? `A=${a}  B=${b}` : `A=${a}`}</b></div><div><small>GATE OUTPUT</small><b className={output ? 'truth-one' : 'truth-zero'}>{output}</b></div></div></section></Reveal>
      </div>
      <Reveal delay={70}><ResultCircuit expression={GATES[gate].expression.replace(/·/g, '*')} title={`${gate} → Gate-level circuit`} subtitle="Entered table + gate output + Boolean representation" /></Reveal>
    </div>
  )
}

function BitLab({ onUse }) {
  const [basis, setBasis] = useState('decimal')
  const [input, setInput] = useState('42')
  const [shift, setShift] = useState(1)
  const [direction, setDirection] = useState('left')
  const numericValue = useMemo(() => {
    if (basis === 'decimal') return Math.max(0, Number.parseInt(input, 10) || 0)
    if (basis === 'binary') return Number.parseInt(input.replace(/[^01]/g, '') || '0', 2)
    if (basis === 'octal') return Number.parseInt(input.replace(/[^0-7]/g, '') || '0', 8)
    return Number.parseInt(input.replace(/[^0-9a-f]/gi, '') || '0', 16)
  }, [basis, input])
  const value = Number.isFinite(numericValue) ? numericValue : 0
  const binaryValue = (value >>> 0).toString(2).padStart(8, '0')
  const shifted = direction === 'left' ? (value * 2 ** shift) >>> 0 : value >>> shift
  const shiftedBinary = (shifted >>> 0).toString(2).padStart(Math.max(8, binaryValue.length), '0').slice(-Math.max(8, binaryValue.length))
  const ascii = value >= 32 && value <= 126 ? String.fromCharCode(value) : value === 10 ? '\\n' : value === 13 ? '\\r' : value === 9 ? '\\t' : 'Non-printable'
  const byteGroups = binaryValue.match(/.{1,8}/g) || ['00000000']
  const setBasisAndFormat = (nextBasis) => {
    setBasis(nextBasis)
    if (nextBasis === 'decimal') setInput(String(value))
    if (nextBasis === 'binary') setInput(value.toString(2))
    if (nextBasis === 'octal') setInput(value.toString(8))
    if (nextBasis === 'hex') setInput(value.toString(16).toUpperCase())
  }
  useEffect(() => { onUse?.('Bit Analysis Lab') }, [basis, direction])
  const compareBits = binaryValue.split('').map((bit, index) => ({ index, before: bit, after: shiftedBinary.slice(-binaryValue.length).padStart(binaryValue.length, '0')[index] || '0' }))

  return (
    <div className="lab-page">
      <Reveal><section className="hero-panel glass"><div><span className="section-kicker">REPRESENTATION WORKBENCH</span><h2>Every number has more than one shape.</h2><p>Convert a value across number systems, inspect ASCII and byte representation, and see exactly how a shift changes each displayed bit.</p></div><div className="bit-mosaic">{binaryValue.split('').map((bit, index) => <span key={index}>{bit}</span>)}</div></section></Reveal>
      <Reveal delay={40}><section className="control-panel glass bit-controls"><div className="control-group"><label>Input basis</label><div className="segmented">{['decimal', 'binary', 'octal', 'hex'].map((item) => <button key={item} className={basis === item ? 'active' : ''} onClick={() => setBasisAndFormat(item)}>{item.toUpperCase()}</button>)}</div></div><label className="wide-field">Value<input value={input} onChange={(e) => setInput(e.target.value)} /></label><button className="primary-btn" onClick={() => setInput(input.trim() || '0')}>Refresh ↗</button></section></Reveal>
      <Reveal delay={60}><div className="conversion-grid">{[
        ['DECIMAL', String(value)], ['BINARY', binaryValue], ['OCTAL', value.toString(8)], ['HEXADECIMAL', value.toString(16).toUpperCase()], ['ASCII', ascii], ['BYTE', byteGroups.join(' ')],
      ].map(([label, result]) => <article key={label} className="conversion-card glass"><small>{label}</small><code>{result}</code></article>)}</div></Reveal>
      <Reveal delay={80}><section className="panel"><div className="panel-head"><div><span className="section-kicker">SHIFT ANALYSIS</span><h3>Before → operation → after</h3></div><div className="focus-tabs"><button className={direction === 'left' ? 'active' : ''} onClick={() => setDirection('left')}>Left shift</button><button className={direction === 'right' ? 'active' : ''} onClick={() => setDirection('right')}>Right shift</button></div></div><div className="shift-controls"><label>Shift count<input type="number" min="0" max="16" value={shift} onChange={(e) => setShift(Math.max(0, Math.min(16, Number(e.target.value) || 0)))} /></label><div className="shift-flow"><div><small>BEFORE</small><code>{binaryValue}</code><b>{value}</b></div><span className="shift-arrow">{direction === 'left' ? '⟹' : '⟸'}</span><div><small>AFTER</small><code>{shiftedBinary}</code><b>{shifted}</b></div></div></div><div className="bit-strip">{compareBits.slice(-8).map((bit) => <div key={bit.index} className={bit.before !== bit.after ? 'changed' : ''}><span>bit {bit.index}</span><b>{bit.before}</b><em>{bit.after}</em></div>)}</div><div className="callout"><b>{direction === 'left' ? 'Left shift' : 'Right shift'} by {shift}</b><p>{direction === 'left' ? `Unsigned demonstration: the value is moved ${shift} place${shift === 1 ? '' : 's'} left, equivalent to multiplying by 2^${shift}.` : `Unsigned demonstration: the value is moved ${shift} place${shift === 1 ? '' : 's'} right, with zero fill on the left.`}</p></div></section></Reveal>
    </div>
  )
}

function ProfileLab({ profile, history, theme }) {
  return <div className="lab-page"><Reveal><section className="profile-hero glass"><div className="profile-avatar-large">{profile.name[0]?.toUpperCase()}</div><div><span className="section-kicker">LOCAL PROFILE</span><h2>{profile.name}</h2><p>Lab ID: <b>{profile.id}</b></p><p>Everything here is stored locally in this browser prototype.</p></div></section></Reveal><Reveal delay={50}><div className="two-col"><section className="panel"><div className="panel-head"><div><span className="section-kicker">LAB TRAIL</span><h3>Recent modules</h3></div></div>{history.length ? <div className="history-list">{history.slice(0, 10).map((item, index) => <div key={`${item}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><b>{item}</b><small>local session</small></div>)}</div> : <div className="empty-note">Your recent lab modules will appear here.</div>}</section><section className="panel"><div className="panel-head"><div><span className="section-kicker">INTERFACE</span><h3>{THEMES.find((item) => item.id === theme)?.label} theme</h3></div></div><div className="theme-preview"><div className="preview-swatch bright" /><div className="preview-swatch purple" /><div className="preview-swatch ocean" /></div><p className="muted">Bright is the default light workspace, Purple Dark uses the requested purple-forward dark palette, and Ocean uses a cool blue-teal glass system.</p></section></div></Reveal></div>
}

export default function App() {
  const [screen, setScreen] = useState(() => {
    try {
      return localStorage.getItem('logicnova_session') === '1' ? 'dashboard' : 'landing'
    } catch {
      return 'landing'
    }
  })
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem('logicnova_profile')) || { name: 'Guest', password: '', id: '', history: [] } } catch { return { name: 'Guest', password: '', id: '', history: [] } }
  })
  const [active, setActive] = useState('kmap')
  const [theme, setTheme] = useState(() => localStorage.getItem('logicnova_theme') || 'bright')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('logicnova_theme', theme)
  }, [theme])

  const launchLab = () => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setScreen('login')
  }

  const login = (data) => {
    const next = { ...profile, ...data, history: profile.history || [] }
    setProfile(next)
    localStorage.setItem('logicnova_profile', JSON.stringify(next))
    localStorage.setItem('logicnova_session', '1')
    setScreen('dashboard')
  }
  const logout = () => {
    localStorage.removeItem('logicnova_session')
    setScreen('landing')
  }
  const useLab = (lab) => {
    setProfile((current) => {
      const history = [lab, ...(current.history || []).filter((x) => x !== lab)].slice(0, 12)
      const next = { ...current, history }
      localStorage.setItem('logicnova_profile', JSON.stringify(next))
      return next
    })
  }

  if (screen === 'landing') return <Landing onStart={launchLab} />
  if (screen === 'login') return <Login profile={profile} onLogin={login} />
  return <Dashboard profile={profile} active={active} setActive={setActive} theme={theme} setTheme={setTheme} logout={logout} setLabHistory={useLab} />
}
