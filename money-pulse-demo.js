(() => {
  const storageKey = 'moneyPulsePortfolioDemoV2'
  const today = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const offsetDate = (days) => {
    const date = new Date(today)
    date.setDate(date.getDate() + days)
    return dateKey(date)
  }
  const roundMoney = (value) => Number(Number(value || 0).toFixed(1))
  const formatMoney = (value) => roundMoney(value).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))

  const initialState = () => ({
    baseFunds: 4371,
    budget: 3200,
    goalCurrent: 1200,
    goalTarget: 10000,
    type: 'expense',
    category: '餐饮',
    chartRange: 'time',
    ledgerView: 'detail',
    ledgerFilter: 'all',
    monthOffset: 0,
    selectedLesson: '',
    transactions: [
      { id: 1, type: 'expense', category: '餐饮', amount: 36.5, note: '咖啡与早餐', date: offsetDate(0), time: '08:42' },
      { id: 2, type: 'expense', category: '交通', amount: 18, note: '地铁', date: offsetDate(-1), time: '18:20' },
      { id: 3, type: 'expense', category: '购物', amount: 128, note: '生活用品', date: offsetDate(-3), time: '20:16' },
      { id: 4, type: 'expense', category: '日用', amount: 48.5, note: '日常补给', date: offsetDate(-5), time: '12:08' },
      { id: 5, type: 'income', category: '兼职', amount: 860, note: '设计项目', date: offsetDate(-6), time: '15:30' }
    ]
  })

  let state
  try {
    state = { ...initialState(), ...(JSON.parse(localStorage.getItem(storageKey)) || {}) }
  } catch (_) {
    state = initialState()
  }

  const expenseCategories = ['餐饮', '购物', '交通', '日用', '娱乐', '居住', '学习', '其他']
  const incomeCategories = ['工资', '兼职', '奖金', '报销', '红包', '退款', '其他收入', '理财']
  const colors = ['#5579dc', '#d875ac', '#d3a03f', '#36a987', '#8a70c8', '#ec755f']
  const chartLabels = {
    time: ['实时资金曲线', '按每笔记录刷新'],
    day: ['日 K 资金曲线', '按近 7 天聚合'],
    month: ['月 K 资金曲线', '按未来 6 个月估算']
  }
  const lessons = {
    saving: '建议先保留 1 个月必要开销，再把额外现金用于高息债务。',
    budget: '把预算拆成固定支出、弹性支出和快乐额度，最容易坚持。'
  }
  const el = (id) => document.getElementById(id)
  const saveState = () => localStorage.setItem(storageKey, JSON.stringify(state))
  const selectedMonthDate = () => new Date(today.getFullYear(), today.getMonth() + Number(state.monthOffset || 0), 1)
  const currentMonth = () => dateKey(selectedMonthDate()).slice(0, 7)
  const monthTransactions = () => state.transactions.filter((item) => item.date.startsWith(currentMonth()))
  const sum = (items, type) => items.filter((item) => item.type === type).reduce((total, item) => total + Number(item.amount), 0)

  function showToast(message) {
    const toast = el('demoToast')
    toast.textContent = message
    toast.classList.remove('visible')
    window.requestAnimationFrame(() => toast.classList.add('visible'))
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 1500)
  }

  function pulse(selector) {
    const target = document.querySelector(selector)
    if (!target) return
    target.classList.remove('demo-pulse')
    void target.offsetWidth
    target.classList.add('demo-pulse')
  }

  function totals() {
    const items = monthTransactions()
    const income = roundMoney(sum(items, 'income'))
    const expense = roundMoney(sum(items, 'expense'))
    const todayItems = items.filter((item) => item.date === dateKey(today))
    const todayIncome = roundMoney(sum(todayItems, 'income'))
    const todayExpense = roundMoney(sum(todayItems, 'expense'))
    const totalFunds = roundMoney(state.baseFunds + income - expense)
    return { items, income, expense, balance: roundMoney(income - expense), todayIncome, todayExpense, todayDelta: roundMoney(todayIncome - todayExpense), totalFunds }
  }

  function forecast(summary) {
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const elapsed = Math.max(1, today.getDate())
    const remaining = Math.max(0, daysInMonth - elapsed)
    const recentDays = Math.min(7, elapsed)
    let recentExpense = 0
    for (let index = 0; index < recentDays; index += 1) {
      recentExpense += sum(summary.items.filter((item) => item.date === offsetDate(-index)), 'expense')
    }
    const monthDaily = summary.expense / elapsed
    const recentDaily = recentExpense / recentDays
    const adjustedRecent = monthDaily ? Math.min(monthDaily * 1.8, Math.max(monthDaily * .4, recentDaily)) : 0
    const behaviorDaily = monthDaily * .7 + adjustedRecent * .3
    const historyWeight = Math.min(1, elapsed / 14)
    const budgetDaily = state.budget / daysInMonth
    const forecastDaily = behaviorDaily * historyWeight + budgetDaily * (1 - historyWeight)
    return roundMoney(summary.income - (summary.expense + forecastDaily * remaining))
  }

  function pointFromValues(values) {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = Math.max(1, max - min)
    return values.map((value, index) => ({ x: index * 310 / Math.max(1, values.length - 1) + 5, y: 108 - (value - min) / range * 82 }))
  }

  function chartPoints(summary) {
    if (state.chartRange === 'day') {
      const firstKey = offsetDate(-6)
      let running = state.baseFunds + summary.items
        .filter((item) => item.date < firstKey)
        .reduce((total, item) => total + (item.type === 'income' ? item.amount : -item.amount), 0)
      const values = []
      for (let index = 6; index >= 0; index -= 1) {
        const key = offsetDate(-index)
        const dayDelta = summary.items
          .filter((item) => item.date === key)
          .reduce((total, item) => total + (item.type === 'income' ? item.amount : -item.amount), 0)
        running = roundMoney(running + dayDelta)
        values.push(running)
      }
      return pointFromValues(values)
    }

    if (state.chartRange === 'month') {
      const monthForecast = forecast(summary)
      const values = Array.from({ length: 6 }, (_, index) => roundMoney(summary.totalFunds + (monthForecast - summary.balance) * (index / 5) - index * 42))
      return pointFromValues(values)
    }

    const sorted = [...summary.items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    let running = state.baseFunds
    const values = [running]
    sorted.forEach((item) => {
      running += item.type === 'income' ? item.amount : -item.amount
      values.push(roundMoney(running))
    })
    return pointFromValues(values)
  }

  function drawChart(summary) {
    const points = chartPoints(summary)
    const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
    const area = `M${points[0].x},114 L${line.replaceAll(' ', ' L')} L${points[points.length - 1].x},114 Z`
    el('chartLine').setAttribute('d', `M${line.replaceAll(' ', ' L')}`)
    el('chartArea').setAttribute('d', area)
    const last = points[points.length - 1]
    el('chartDot').setAttribute('cx', last.x)
    el('chartDot').setAttribute('cy', last.y)
  }

  function filteredTransactions(summary) {
    if (state.ledgerFilter === 'all') return summary.items
    return summary.items.filter((item) => item.type === state.ledgerFilter)
  }

  function renderTransactions(summary) {
    const items = filteredTransactions(summary)
    if (!items.length) {
      const copy = state.ledgerFilter === 'transfer' ? '本月暂无转账记录，筛选键已生效。' : '当前筛选下暂无记录。'
      el('transactionList').innerHTML = `<div class="transaction-empty">${copy}</div>`
      return
    }

    if (state.ledgerView === 'calendar') {
      const groups = {}
      items.forEach((item) => {
        groups[item.date] = groups[item.date] || { income: 0, expense: 0, count: 0 }
        groups[item.date][item.type] += item.amount
        groups[item.date].count += 1
      })
      el('transactionList').innerHTML = Object.entries(groups)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, row]) => `<div class="transaction-item calendar-item"><span class="transaction-icon">${date.slice(8)}</span><div><strong>${escapeHtml(date)}</strong><small>${row.count} 笔记录</small></div><span class="transaction-amount ${row.income >= row.expense ? 'income' : 'expense'}">${row.income >= row.expense ? '+' : '-'}¥${formatMoney(Math.abs(row.income - row.expense))}</span></div>`)
        .join('')
      return
    }

    const sorted = [...items].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    el('transactionList').innerHTML = sorted.map((item) => `<div class="transaction-item"><span class="transaction-icon">${escapeHtml(item.category.slice(0, 1))}</span><div><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.note || '未填写备注')} · ${escapeHtml(item.time)}</small></div><span class="transaction-amount ${item.type}">${item.type === 'income' ? '+' : '-'}¥${formatMoney(item.amount)}</span></div>`).join('')
  }

  function renderBars(summary) {
    const values = {}
    summary.items.filter((item) => item.type === 'expense').forEach((item) => { values[item.category] = (values[item.category] || 0) + item.amount })
    const rows = Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const max = rows.length ? rows[0][1] : 1
    el('spendBars').innerHTML = rows.map(([name, amount], index) => `<div class="spend-row"><span>${escapeHtml(name)}</span><i><b style="width:${Math.max(8, amount / max * 100)}%;background:${colors[index % colors.length]}"></b></i><strong>¥${formatMoney(amount)}</strong></div>`).join('') || '<div class="spend-row"><span>暂无</span><i></i><strong>¥0.0</strong></div>'
  }

  function renderCategories() {
    const categories = state.type === 'expense' ? expenseCategories : incomeCategories
    if (!categories.includes(state.category)) state.category = categories[0]
    el('categoryGrid').innerHTML = categories.map((category) => `<button type="button" class="${category === state.category ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('')
    el('categoryGrid').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      state.category = button.dataset.category
      renderCategories()
      showToast(`已选择 ${state.category}`)
    }))
  }

  function renderControls() {
    document.querySelectorAll('[data-chart-range]').forEach((button) => button.classList.toggle('active', button.dataset.chartRange === state.chartRange))
    document.querySelectorAll('[data-ledger-view]').forEach((button) => button.classList.toggle('active', button.dataset.ledgerView === state.ledgerView))
    document.querySelectorAll('[data-ledger-filter]').forEach((button) => button.classList.toggle('active', button.dataset.ledgerFilter === state.ledgerFilter))
    document.querySelectorAll('[data-lesson]').forEach((button) => button.classList.toggle('active', button.dataset.lesson === state.selectedLesson))
  }

  function render() {
    const summary = totals()
    const monthForecast = forecast(summary)
    const budgetRate = Math.min(100, Math.round(summary.expense / Math.max(1, state.budget) * 100))
    const goalRate = Math.min(100, Math.round(state.goalCurrent / state.goalTarget * 100))
    const savingRate = summary.income ? Math.max(0, Math.round((summary.income - summary.expense) / summary.income * 100)) : 0
    const health = Math.max(35, Math.min(96, Math.round(62 + savingRate * .28 - Math.max(0, budgetRate - 85) * .3)))
    const sign = (value) => value >= 0 ? '+' : '-'
    const monthDate = selectedMonthDate()
    const chartCopy = chartLabels[state.chartRange] || chartLabels.time

    document.querySelector('.chart-label span').textContent = chartCopy[0]
    document.querySelector('.chart-label strong').textContent = state.chartRange === 'month'
      ? `${monthForecast < 0 ? '-' : '+'}¥${formatMoney(Math.abs(monthForecast))}`
      : `${sign(summary.balance)}¥${formatMoney(Math.abs(summary.balance))}`
    el('totalFunds').textContent = `¥ ${formatMoney(summary.totalFunds)}`
    el('todayDelta').textContent = `今日 ${sign(summary.todayDelta)}¥${formatMoney(Math.abs(summary.todayDelta))}`
    el('todayExpense').textContent = `¥${formatMoney(summary.todayExpense)}`
    el('monthBalance').textContent = `${summary.balance < 0 ? '-' : ''}¥${formatMoney(Math.abs(summary.balance))}`
    el('monthForecast').textContent = `${monthForecast < 0 ? '-' : ''}¥${formatMoney(Math.abs(monthForecast))}`
    el('ledgerIncome').textContent = `¥${formatMoney(summary.income)}`
    el('ledgerExpense').textContent = `¥${formatMoney(summary.expense)}`
    el('ledgerBalance').textContent = `${summary.balance < 0 ? '-' : ''}¥${formatMoney(Math.abs(summary.balance))}`
    el('forecastLarge').textContent = `${monthForecast < 0 ? '-' : ''}¥${formatMoney(Math.abs(monthForecast))}`
    el('budgetRate').textContent = `${budgetRate}%`
    el('budgetBar').style.width = `${budgetRate}%`
    el('goalRate').textContent = `${goalRate}%`
    document.querySelector('.goal-bar').style.width = `${goalRate}%`
    el('goalCurrent').textContent = `¥${formatMoney(state.goalCurrent)}`
    el('goalProgress').style.width = `${goalRate}%`
    el('savingRate').textContent = `${savingRate}%`
    el('healthScore').textContent = health
    el('ledgerMonth').textContent = `${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`
    el('demoTime').textContent = `${pad(today.getHours())}:${pad(today.getMinutes())}`

    const stable = monthForecast >= 0
    el('insightTitle').textContent = stable ? '当前现金流保持稳定' : '本月支出速度需要留意'
    el('insightCopy').textContent = stable ? `月底预计结余 ¥${formatMoney(monthForecast)}，${chartCopy[1]}。` : `按当前节奏，月底可能出现 ¥${formatMoney(Math.abs(monthForecast))} 缺口。`
    el('reportTitle').textContent = budgetRate < 80 ? '支出节奏处于可控范围' : '预算正在接近上限'
    el('reportCopy').textContent = budgetRate < 80 ? '近期消费变化平稳，继续保持记录并优先完成储蓄目标。' : '建议检查高频消费，为必要支出预留空间。'
    el('lessonResult').textContent = state.selectedLesson ? lessons[state.selectedLesson] : '点开一课，会生成今日行动建议。'

    drawChart(summary)
    renderTransactions(summary)
    renderBars(summary)
    renderCategories()
    renderControls()
    saveState()
  }

  function switchView(name) {
    document.querySelectorAll('.demo-view').forEach((view) => view.classList.toggle('active', view.dataset.view === name))
    document.querySelectorAll('.demo-nav [data-view-target]').forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === name))
  }

  document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => {
    switchView(button.dataset.viewTarget)
    showToast(`已切换到${button.textContent.trim()}`)
  }))

  document.querySelectorAll('[data-chart-range]').forEach((button) => button.addEventListener('click', () => {
    state.chartRange = button.dataset.chartRange
    render()
    pulse('.capital-chart')
    showToast(`曲线切换为 ${button.textContent.trim()}`)
  }))

  document.querySelectorAll('[data-ledger-view]').forEach((button) => button.addEventListener('click', () => {
    state.ledgerView = button.dataset.ledgerView
    render()
    showToast(`账本切换为${button.textContent.trim()}`)
  }))

  document.querySelectorAll('[data-ledger-filter]').forEach((button) => button.addEventListener('click', () => {
    state.ledgerFilter = button.dataset.ledgerFilter
    render()
    showToast(`筛选：${button.textContent.trim()}`)
  }))

  document.querySelectorAll('[data-month-shift]').forEach((button) => button.addEventListener('click', () => {
    state.monthOffset += Number(button.dataset.monthShift)
    render()
    showToast(button.dataset.monthShift === '1' ? '查看下个月' : '查看上个月')
  }))

  document.querySelectorAll('.type-switch button').forEach((button) => button.addEventListener('click', () => {
    state.type = button.dataset.type
    document.querySelectorAll('.type-switch button').forEach((item) => item.classList.toggle('active', item === button))
    renderCategories()
    showToast(`记账类型：${button.textContent.trim()}`)
  }))

  el('saveTransaction').addEventListener('click', () => {
    const amount = roundMoney(el('amountInput').value)
    if (amount <= 0) {
      el('demoFeedback').textContent = '请输入有效金额'
      showToast('金额需要大于 0')
      return
    }
    state.monthOffset = 0
    state.transactions.unshift({ id: Date.now(), type: state.type, category: state.category, amount, note: el('noteInput').value.trim(), date: dateKey(today), time: `${pad(today.getHours())}:${pad(today.getMinutes())}` })
    el('demoFeedback').textContent = `已记录${state.type === 'income' ? '收入' : '支出'} ¥${formatMoney(amount)}`
    el('noteInput').value = ''
    render()
    pulse('#totalFunds')
    showToast('记录成功，首页数据已更新')
    window.setTimeout(() => switchView('home'), 650)
  })

  document.querySelectorAll('[data-demo-action="import"]').forEach((button) => button.addEventListener('click', () => {
    el('fundModal').hidden = false
    showToast('打开资金导入')
    window.setTimeout(() => el('fundAmount').focus(), 50)
  }))

  document.querySelectorAll('[data-demo-action="profile"]').forEach((button) => button.addEventListener('click', () => {
    switchView('growth')
    pulse('.level-badge')
    showToast('账户入口已打开成长页')
  }))

  document.querySelectorAll('[data-demo-action="close-modal"]').forEach((button) => button.addEventListener('click', () => {
    el('fundModal').hidden = true
    showToast('已关闭导入')
  }))

  el('confirmFunds').addEventListener('click', () => {
    const amount = roundMoney(el('fundAmount').value)
    if (amount <= 0) {
      showToast('请输入当前资金金额')
      return
    }
    const summary = totals()
    state.baseFunds = roundMoney(amount - summary.income + summary.expense)
    el('fundModal').hidden = true
    render()
    pulse('#totalFunds')
    showToast(`${el('fundName').value || '账户'} 已校准为 ¥${formatMoney(amount)}`)
  })

  el('fundModal').addEventListener('click', (event) => {
    if (event.target === el('fundModal')) {
      el('fundModal').hidden = true
      showToast('已关闭导入')
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') el('fundModal').hidden = true
  })

  document.querySelector('[data-demo-action="reset"]').addEventListener('click', () => {
    state = initialState()
    render()
    showToast('演示数据已恢复')
  })

  el('depositGoal').addEventListener('click', () => {
    state.goalCurrent = Math.min(state.goalTarget, roundMoney(state.goalCurrent + 100))
    render()
    pulse('#goalProgress')
    showToast('已存入目标 ¥100.0')
  })

  document.querySelectorAll('[data-lesson]').forEach((button) => button.addEventListener('click', () => {
    state.selectedLesson = button.dataset.lesson
    render()
    showToast('已生成学习建议')
  }))

  const menu = document.querySelector('.menu')
  const links = document.querySelector('.nav-links')
  menu.addEventListener('click', () => {
    links.classList.toggle('open')
    menu.textContent = links.classList.contains('open') ? '×' : '☰'
  })

  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return
    entry.target.classList.add('visible')
    observer.unobserve(entry.target)
  }), { threshold: .1 })
  document.querySelectorAll('.reveal').forEach((item) => observer.observe(item))
  render()
})()
