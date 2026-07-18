(() => {
  const storageKey = 'moneyPulsePortfolioDemoV3'
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
  const el = (id) => document.getElementById(id)

  const initialState = () => ({
    version: 3,
    privacyMode: false,
    budget: 3200,
    type: 'expense',
    category: '餐饮',
    chartRange: 'time',
    ledgerView: 'detail',
    ledgerFilter: 'all',
    ledgerSearch: '',
    selectedDate: dateKey(today),
    monthOffset: 0,
    selectedLesson: '',
    editingId: null,
    accounts: [
      { id: 'wechat', name: '微信零钱', type: 'cash', balance: 800 },
      { id: 'bank', name: '工资银行卡', type: 'bank', balance: 3000 },
      { id: 'saving', name: '储蓄账户', type: 'saving', balance: 571 }
    ],
    goals: [{ id: 'goal-1', name: '建立应急金', target: 10000, current: 1200, deadline: offsetDate(90) }],
    tasks: [
      { id: 'record', title: '完成今天的记账', done: false },
      { id: 'budget', title: '检查本月预算进度', done: false },
      { id: 'lesson', title: '学习一条财务建议', done: false }
    ],
    transactions: [
      { id: 1, type: 'expense', category: '餐饮', amount: 36.5, accountId: 'wechat', note: '咖啡与早餐', date: offsetDate(0), time: '08:42' },
      { id: 2, type: 'expense', category: '交通', amount: 18, accountId: 'wechat', note: '地铁', date: offsetDate(-1), time: '18:20' },
      { id: 3, type: 'expense', category: '购物', amount: 128, accountId: 'bank', note: '生活用品', date: offsetDate(-3), time: '20:16' },
      { id: 4, type: 'expense', category: '日用', amount: 48.5, accountId: 'wechat', note: '日常补给', date: offsetDate(-5), time: '12:08' },
      { id: 5, type: 'income', category: '兼职', amount: 860, accountId: 'bank', note: '设计项目', date: offsetDate(-6), time: '15:30' }
    ]
  })

  let state
  try {
    state = { ...initialState(), ...(JSON.parse(localStorage.getItem(storageKey)) || {}) }
  } catch (_) {
    state = initialState()
  }
  state.accounts = Array.isArray(state.accounts) && state.accounts.length ? state.accounts : initialState().accounts
  state.goals = Array.isArray(state.goals) ? state.goals : initialState().goals
  state.tasks = Array.isArray(state.tasks) ? state.tasks : initialState().tasks
  state.transactions = Array.isArray(state.transactions) ? state.transactions : []

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
  const tools = [
    { type: 'mortgage', icon: '房', name: '房贷计算' },
    { type: 'compound', icon: '复', name: '复利计算' },
    { type: 'emergency', icon: '应', name: '应急金' },
    { type: 'salary', icon: '薪', name: '工资分配' },
    { type: 'savings', icon: '储', name: '储蓄计划' },
    { type: 'repayment', icon: '还', name: '还款计划' }
  ]
  const calculatorConfigs = {
    mortgage: { title: '房贷计算器', fields: [['amount', '贷款金额（万元）', 100], ['years', '贷款年限', 30], ['rate', '年利率（%）', 3.25]] },
    compound: { title: '复利计算器', fields: [['principal', '初始金额', 10000], ['monthly', '每月投入', 1000], ['rate', '年化（%）', 3], ['years', '持续年数', 5]] },
    emergency: { title: '应急金计算器', fields: [['monthly', '每月必要支出', 3000], ['months', '覆盖月数', 6]] },
    salary: { title: '工资分配方案', fields: [['income', '每月到手收入', 8000]] },
    savings: { title: '储蓄目标计划', fields: [['target', '目标金额', 20000], ['current', '已有金额', 5000], ['months', '计划月数', 12]] },
    repayment: { title: '还款计划计算', fields: [['debt', '当前欠款', 10000], ['rate', '年利率（%）', 12], ['payment', '每月还款', 1000]] }
  }

  const saveState = () => localStorage.setItem(storageKey, JSON.stringify(state))
  const selectedMonthDate = () => new Date(today.getFullYear(), today.getMonth() + Number(state.monthOffset || 0), 1)
  const currentMonth = () => dateKey(selectedMonthDate()).slice(0, 7)
  const monthTransactions = () => state.transactions.filter((item) => item.date.startsWith(currentMonth()))
  const sum = (items, type) => items.filter((item) => item.type === type).reduce((total, item) => total + Number(item.amount), 0)
  const accountName = (id) => state.accounts.find((item) => item.id === id)?.name || '未设置账户'
  const baseFunds = () => roundMoney(state.accounts.reduce((total, account) => total + Number(account.balance || 0), 0))
  const balanceTransactions = () => state.transactions.filter((item) => item.affectsBalance !== false)

  function showToast(message) {
    const toast = el('demoToast')
    toast.textContent = message
    toast.classList.remove('visible')
    window.requestAnimationFrame(() => toast.classList.add('visible'))
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), 1700)
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
    const allBalanceItems = balanceTransactions()
    const totalFunds = roundMoney(baseFunds() + sum(allBalanceItems, 'income') - sum(allBalanceItems, 'expense'))
    const todayItems = state.transactions.filter((item) => item.date === dateKey(today))
    const todayIncome = sum(todayItems, 'income')
    const todayExpense = sum(todayItems, 'expense')
    return { items, income, expense, balance: roundMoney(income - expense), totalFunds, todayExpense: roundMoney(todayExpense), todayDelta: roundMoney(todayIncome - todayExpense) }
  }

  function forecast(summary) {
    const monthDate = selectedMonthDate()
    if (monthDate > new Date(today.getFullYear(), today.getMonth(), 1)) return 0
    if (monthDate < new Date(today.getFullYear(), today.getMonth(), 1)) return summary.balance
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const elapsed = Math.max(1, today.getDate())
    const remaining = Math.max(0, daysInMonth - elapsed)
    const averageDaily = summary.expense / elapsed
    const budgetDaily = Number(state.budget || 0) / daysInMonth
    const forecastDaily = averageDaily * .7 + budgetDaily * .3
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
      let running = summary.totalFunds
      const values = []
      for (let index = 6; index >= 0; index -= 1) {
        const key = offsetDate(-index)
        const delta = state.transactions.filter((item) => item.date === key && item.affectsBalance !== false).reduce((total, item) => total + (item.type === 'income' ? item.amount : item.type === 'expense' ? -item.amount : 0), 0)
        running = roundMoney(running + delta)
        values.push(running)
      }
      return pointFromValues(values)
    }
    if (state.chartRange === 'month') {
      const monthForecast = forecast(summary)
      return pointFromValues(Array.from({ length: 6 }, (_, index) => roundMoney(summary.totalFunds + (monthForecast - summary.balance) * (index / 5) - index * 42)))
    }
    const sorted = [...summary.items].filter((item) => item.affectsBalance !== false).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    let running = baseFunds()
    const values = [running]
    sorted.forEach((item) => {
      if (item.type === 'income') running += item.amount
      if (item.type === 'expense') running -= item.amount
      values.push(roundMoney(running))
    })
    return pointFromValues(values)
  }

  function drawChart(summary) {
    const points = chartPoints(summary)
    const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
    el('chartLine').setAttribute('d', `M${line.replaceAll(' ', ' L')}`)
    el('chartArea').setAttribute('d', `M${points[0].x},114 L${line.replaceAll(' ', ' L')} L${points[points.length - 1].x},114 Z`)
    const last = points[points.length - 1]
    el('chartDot').setAttribute('cx', last.x)
    el('chartDot').setAttribute('cy', last.y)
  }

  function filteredTransactions(summary) {
    let items = state.ledgerFilter === 'all' ? summary.items : summary.items.filter((item) => item.type === state.ledgerFilter)
    const query = String(state.ledgerSearch || '').trim().toLowerCase()
    if (query) items = items.filter((item) => `${item.category} ${item.note || ''} ${accountName(item.accountId)} ${accountName(item.toAccountId)}`.toLowerCase().includes(query))
    return items
  }

  function renderTransactions(summary) {
    const items = filteredTransactions(summary)
    if (!items.length) {
      el('transactionList').innerHTML = `<div class="transaction-empty">${state.ledgerFilter === 'transfer' ? '本月暂无转账记录。' : '当前筛选下暂无记录。'}</div>`
      return
    }
    if (state.ledgerView === 'calendar') {
      const monthDate = selectedMonthDate()
      const days = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
      const leading = (new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getDay() + 6) % 7
      const monthKey = currentMonth()
      if (!String(state.selectedDate || '').startsWith(monthKey)) state.selectedDate = `${monthKey}-01`
      const groups = {}
      items.forEach((item) => {
        groups[item.date] = groups[item.date] || { income: 0, expense: 0, count: 0 }
        if (item.type !== 'transfer') groups[item.date][item.type] += item.amount
        groups[item.date].count += 1
      })
      const cells = Array.from({ length: leading }, () => '<span class="calendar-cell-web blank"></span>')
      for (let day = 1; day <= days; day += 1) {
        const key = `${monthKey}-${pad(day)}`
        const row = groups[key] || { income: 0, expense: 0, count: 0 }
        cells.push(`<button type="button" class="calendar-cell-web ${state.selectedDate === key ? 'selected' : ''}" data-calendar-date="${key}"><b>${day}</b><small class="income">${row.income ? `+${formatMoney(row.income)}` : ''}</small><small class="expense">${row.expense ? `-${formatMoney(row.expense)}` : ''}</small></button>`)
      }
      const selectedItems = items.filter((item) => item.date === state.selectedDate).sort((a, b) => b.time.localeCompare(a.time))
      const selectedHtml = selectedItems.length ? selectedItems.map((item) => `<button class="transaction-item" type="button" data-transaction-id="${escapeHtml(item.id)}"><span class="transaction-icon">${escapeHtml((item.category || '账').slice(0, 1))}</span><div><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.note || accountName(item.accountId))} · ${escapeHtml(item.time)}</small></div><span class="transaction-amount ${item.type}">${item.type === 'transfer' ? '' : item.type === 'income' ? '+' : '-'}¥${formatMoney(item.amount)}</span></button>`).join('') : '<div class="transaction-empty">当日暂无记录</div>'
      el('transactionList').innerHTML = `<div class="calendar-card-web"><div class="calendar-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div class="calendar-grid-web">${cells.join('')}</div></div><div class="selected-day-title">${state.selectedDate}</div><div class="selected-day-list">${selectedHtml}</div>`
      return
    }
    el('transactionList').innerHTML = [...items].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).map((item) => {
      const transfer = item.type === 'transfer'
      const meta = transfer ? `${accountName(item.accountId)} → ${accountName(item.toAccountId)}` : `${accountName(item.accountId)} · ${item.note || '未填写备注'}`
      return `<button class="transaction-item" type="button" data-transaction-id="${escapeHtml(item.id)}"><span class="transaction-icon">${escapeHtml((item.category || '账').slice(0, 1))}</span><div><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(meta)} · ${escapeHtml(item.time)}</small></div><span class="transaction-amount ${item.type}">${transfer ? '' : item.type === 'income' ? '+' : '-'}¥${formatMoney(item.amount)}</span></button>`
    }).join('')
  }

  function renderBars(summary) {
    const groups = {}
    summary.items.filter((item) => item.type === 'expense').forEach((item) => { groups[item.category] = (groups[item.category] || 0) + item.amount })
    const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const max = sorted[0]?.[1] || 1
    el('spendBars').innerHTML = sorted.length ? sorted.map(([name, amount], index) => `<div><span>${escapeHtml(name)}</span><i><b style="width:${Math.max(8, amount / max * 100)}%;background:${colors[index % colors.length]}"></b></i><strong>¥${formatMoney(amount)}</strong></div>`).join('') : '<div class="transaction-empty">本月暂无支出结构</div>'
  }

  function renderCategories() {
    const categories = state.type === 'income' ? incomeCategories : state.type === 'transfer' ? ['账户转账'] : expenseCategories
    if (!categories.includes(state.category)) state.category = categories[0]
    el('categoryGrid').innerHTML = categories.map((category) => `<button type="button" class="${category === state.category ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('')
  }

  function renderAccountOptions() {
    const options = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('')
    const current = el('accountSelect').value
    const target = el('targetAccountSelect').value
    el('accountSelect').innerHTML = options
    el('targetAccountSelect').innerHTML = options
    if (state.accounts.some((item) => item.id === current)) el('accountSelect').value = current
    if (state.accounts.some((item) => item.id === target)) el('targetAccountSelect').value = target
    if (!el('targetAccountSelect').value && state.accounts[1]) el('targetAccountSelect').value = state.accounts[1].id
    el('targetAccountRow').hidden = state.type !== 'transfer'
    el('accountLabel').textContent = state.type === 'transfer' ? '转出账户' : '账户'
  }

  function renderTasks() {
    const done = state.tasks.filter((item) => item.done).length
    el('taskProgress').textContent = `${state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0}%`
    el('taskList').innerHTML = state.tasks.map((task) => `<button class="task-row-web ${task.done ? 'done' : ''}" type="button" data-task-id="${escapeHtml(task.id)}"><span>${task.done ? '✓' : ''}</span>${escapeHtml(task.title)}</button>`).join('')
  }

  function renderControls() {
    document.querySelectorAll('[data-chart-range]').forEach((button) => button.classList.toggle('active', button.dataset.chartRange === state.chartRange))
    document.querySelectorAll('[data-ledger-view]').forEach((button) => button.classList.toggle('active', button.dataset.ledgerView === state.ledgerView))
    document.querySelectorAll('[data-ledger-filter]').forEach((button) => button.classList.toggle('active', button.dataset.ledgerFilter === state.ledgerFilter))
    document.querySelectorAll('[data-lesson]').forEach((button) => button.classList.toggle('active', button.dataset.lesson === state.selectedLesson))
    document.querySelectorAll('.type-switch button').forEach((button) => button.classList.toggle('active', button.dataset.type === state.type))
  }

  function render() {
    const summary = totals()
    const monthForecast = forecast(summary)
    const budgetRate = state.budget ? Math.min(100, Math.round(summary.expense / state.budget * 100)) : 0
    const goal = state.goals[0] || { name: '创建储蓄目标', current: 0, target: 1 }
    const goalRate = goal.target ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0
    const savingRate = summary.income ? Math.max(0, Math.round((summary.income - summary.expense) / summary.income * 100)) : 0
    const health = Math.max(35, Math.min(96, Math.round(62 + savingRate * .28 - Math.max(0, budgetRate - 85) * .3)))
    const sign = (value) => value >= 0 ? '+' : '-'
    const monthDate = selectedMonthDate()
    const chartCopy = chartLabels[state.chartRange] || chartLabels.time
    const moneyText = (value, spaced = false) => state.privacyMode ? '••••••' : `¥${spaced ? ' ' : ''}${formatMoney(value)}`

    document.querySelector('.chart-label span').textContent = chartCopy[0]
    document.querySelector('.chart-label strong').textContent = state.privacyMode ? '••••' : state.chartRange === 'month' ? `${monthForecast < 0 ? '-' : '+'}¥${formatMoney(Math.abs(monthForecast))}` : `${sign(summary.balance)}¥${formatMoney(Math.abs(summary.balance))}`
    el('totalFunds').textContent = moneyText(summary.totalFunds, true)
    el('totalFunds').classList.toggle('privacy-hidden', state.privacyMode)
    el('todayDelta').textContent = state.privacyMode ? '今日 ••••' : `今日 ${sign(summary.todayDelta)}¥${formatMoney(Math.abs(summary.todayDelta))}`
    el('todayExpense').textContent = moneyText(summary.todayExpense)
    el('monthBalance').textContent = state.privacyMode ? '••••' : `${summary.balance < 0 ? '-' : ''}¥${formatMoney(Math.abs(summary.balance))}`
    el('monthForecast').textContent = state.privacyMode ? '••••' : `${monthForecast < 0 ? '-' : ''}¥${formatMoney(Math.abs(monthForecast))}`
    el('forecastLarge').textContent = moneyText(Math.abs(monthForecast))
    el('ledgerIncome').textContent = moneyText(summary.income)
    el('ledgerExpense').textContent = moneyText(summary.expense)
    el('ledgerBalance').textContent = moneyText(Math.abs(summary.balance))
    el('budgetRate').textContent = `${budgetRate}%`
    el('budgetBar').style.width = `${budgetRate}%`
    el('goalRate').textContent = `${goalRate}%`
    document.querySelector('.goal-bar').style.width = `${goalRate}%`
    el('goalName').textContent = goal.name
    el('goalCurrent').textContent = moneyText(goal.current)
    el('goalTarget').textContent = `/ ${moneyText(goal.target)}`
    el('goalProgress').style.width = `${goalRate}%`
    el('savingRate').textContent = `${savingRate}%`
    el('healthScore').textContent = health
    el('ledgerMonth').textContent = `${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`
    el('demoTime').textContent = `${pad(today.getHours())}:${pad(today.getMinutes())}`
    document.querySelector('[data-demo-action="privacy"]').textContent = state.privacyMode ? '显示' : '隐藏'
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
    renderAccountOptions()
    renderTasks()
    renderControls()
    saveState()
  }

  function switchView(name) {
    document.querySelectorAll('.demo-view').forEach((view) => view.classList.toggle('active', view.dataset.view === name))
    document.querySelectorAll('.demo-nav [data-view-target]').forEach((button) => button.classList.toggle('active', button.dataset.viewTarget === name))
  }

  function openModal(title, kicker, html) {
    el('appModalTitle').textContent = title
    el('appModalKicker').textContent = kicker
    el('appModalBody').innerHTML = html
    el('appModal').hidden = false
  }

  function closeModal() { el('appModal').hidden = true }

  function accountCurrentBalance(id) {
    const account = state.accounts.find((item) => item.id === id)
    if (!account) return 0
    return roundMoney(Number(account.balance || 0) + balanceTransactions().reduce((total, item) => {
      if (item.type === 'income' && item.accountId === id) return total + item.amount
      if (item.type === 'expense' && item.accountId === id) return total - item.amount
      if (item.type === 'transfer' && item.accountId === id) return total - item.amount
      if (item.type === 'transfer' && item.toAccountId === id) return total + item.amount
      return total
    }, 0))
  }

  function openAccounts() {
    const assets = state.accounts.filter((item) => accountCurrentBalance(item.id) >= 0).reduce((total, item) => total + accountCurrentBalance(item.id), 0)
    const liabilities = state.accounts.filter((item) => accountCurrentBalance(item.id) < 0).reduce((total, item) => total + Math.abs(accountCurrentBalance(item.id)), 0)
    openModal('账户资产', 'ACCOUNTS', `<div class="modal-summary"><small>净资产 · 资产 ¥${formatMoney(assets)} / 负债 ¥${formatMoney(liabilities)}</small><strong>¥ ${formatMoney(assets - liabilities)}</strong></div><div class="modal-list">${state.accounts.map((account) => `<button class="modal-row" type="button" data-edit-account="${escapeHtml(account.id)}"><div><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.type)}</small></div><span>${accountCurrentBalance(account.id) < 0 ? '-' : ''}¥${formatMoney(Math.abs(accountCurrentBalance(account.id)))}</span></button>`).join('')}</div><div class="modal-actions"><button type="button" data-add-account>添加账户</button><button type="button" class="primary" data-import-funds>导入当前资金</button></div>`)
  }

  function openAccountForm(id = '') {
    const account = state.accounts.find((item) => item.id === id) || { name: '', type: 'bank', balance: 0 }
    openModal(id ? '编辑账户' : '添加账户', 'ACCOUNT', `<form class="modal-form" id="accountForm"><label>账户名称<input name="name" required value="${escapeHtml(account.name)}" placeholder="例如 工资银行卡"></label><label>账户类型<select name="type"><option value="cash">现金</option><option value="bank">银行卡</option><option value="saving">储蓄</option><option value="investment">投资</option><option value="credit">信用/负债</option></select></label><label>当前余额<input name="balance" type="number" step="0.1" value="${accountCurrentBalance(id) || account.balance}"></label><div class="modal-actions">${id ? '<button type="button" data-remove-account class="danger">删除</button>' : ''}<button class="primary" type="submit">保存账户</button></div></form>`)
    el('accountForm').dataset.id = id
    el('accountForm').elements.type.value = account.type
  }

  function openBudget() {
    const summary = totals()
    openModal('月度预算', 'BUDGET', `<div class="modal-summary"><small>本月已支出</small><strong>¥ ${formatMoney(summary.expense)}</strong></div><form class="modal-form" id="budgetForm"><label>预算金额<input name="amount" type="number" min="0" step="0.1" value="${state.budget}"></label><p class="import-help">预算只用于消费控制，不会改变账户余额。</p><button class="modal-primary" type="submit">保存预算</button></form>`)
  }

  function openGoals() {
    openModal('储蓄目标', 'GOALS', `<div class="modal-list">${state.goals.map((goal) => `<div class="modal-row"><div><strong>${escapeHtml(goal.name)}</strong><small>${escapeHtml(goal.deadline)} · ¥${formatMoney(goal.current)} / ¥${formatMoney(goal.target)}</small></div><button type="button" data-deposit-goal="${escapeHtml(goal.id)}">存入</button></div>`).join('') || '<div class="transaction-empty">还没有储蓄目标</div>'}</div><button class="modal-link" type="button" data-add-goal>＋ 创建目标</button>`)
  }

  function openGoalForm() {
    openModal('创建储蓄目标', 'NEW GOAL', `<form class="modal-form" id="goalForm"><label>目标名称<input name="name" required placeholder="例如 旅行基金"></label><label>目标金额<input name="target" type="number" min="1" step="0.1" required></label><label>已有金额<input name="current" type="number" min="0" step="0.1" value="0"></label><label>目标日期<input name="deadline" type="date" value="${offsetDate(90)}"></label><button class="modal-primary" type="submit">创建目标</button></form>`)
  }

  function openDeposit(goalId) {
    openModal('存入目标', 'DEPOSIT', `<div class="modal-actions"><button type="button" data-deposit-value="100" data-goal-id="${goalId}">¥100</button><button type="button" data-deposit-value="500" data-goal-id="${goalId}">¥500</button><button type="button" data-deposit-value="1000" data-goal-id="${goalId}">¥1,000</button></div><form class="modal-form" id="depositForm"><input type="hidden" name="goalId" value="${goalId}"><label>自定义金额<input name="amount" type="number" min="0.1" step="0.1" placeholder="输入金额"></label><button class="modal-primary" type="submit">确认存入</button></form>`)
  }

  function openProfile() {
    openModal('个人中心', 'PROFILE', `<div class="modal-list"><button class="modal-row" type="button" data-profile-action="accounts"><div><strong>账户管理</strong><small>${state.accounts.length} 个账户</small></div><span>›</span></button><button class="modal-row" type="button" data-profile-action="budget"><div><strong>预算设置</strong><small>本月 ¥${formatMoney(state.budget)}</small></div><span>›</span></button><button class="modal-row" type="button" data-profile-action="goals"><div><strong>储蓄目标</strong><small>${state.goals.length} 个目标</small></div><span>›</span></button><button class="modal-row" type="button" data-profile-action="privacy"><div><strong>金额隐私模式</strong><small>${state.privacyMode ? '已开启' : '未开启'}</small></div><span>${state.privacyMode ? '开' : '关'}</span></button><button class="modal-row" type="button" data-profile-action="reset"><div><strong class="danger">恢复演示数据</strong><small>清除当前本地修改</small></div><span>›</span></button></div>`)
  }

  function openTransaction(id) {
    const item = state.transactions.find((transaction) => String(transaction.id) === String(id))
    if (!item) return
    openModal('记录详情', 'TRANSACTION', `<div class="modal-summary"><small>${escapeHtml(item.category)} · ${escapeHtml(item.date)} ${escapeHtml(item.time)}</small><strong>${item.type === 'income' ? '+' : item.type === 'expense' ? '-' : ''}¥ ${formatMoney(item.amount)}</strong></div><div class="modal-list"><div class="modal-row"><div><strong>账户</strong><small>${escapeHtml(accountName(item.accountId))}${item.toAccountId ? ` → ${escapeHtml(accountName(item.toAccountId))}` : ''}</small></div></div><div class="modal-row"><div><strong>备注</strong><small>${escapeHtml(item.note || '未填写')}</small></div></div></div><div class="modal-actions"><button type="button" data-edit-transaction="${escapeHtml(item.id)}">编辑</button><button type="button" class="danger" data-delete-transaction="${escapeHtml(item.id)}">删除</button></div>`)
  }

  function openCalculator(type) {
    const config = calculatorConfigs[type]
    if (!config) return
    openModal(config.title, 'CALCULATOR', `<form class="modal-form" id="calculatorForm" data-type="${type}">${config.fields.map(([key, label, value]) => `<label>${label}<input name="${key}" type="number" step="0.01" value="${value}"></label>`).join('')}<button class="modal-primary" type="submit">重新计算</button></form><div class="calc-results" id="calcResults"></div>`)
    calculate(type, new FormData(el('calculatorForm')))
  }

  function calculate(type, data) {
    const value = (key) => Number(data.get(key) || 0)
    let results = []
    if (type === 'mortgage') {
      const principal = value('amount') * 10000; const months = value('years') * 12; const rate = value('rate') / 100 / 12
      const payment = rate ? principal * rate * Math.pow(1 + rate, months) / (Math.pow(1 + rate, months) - 1) : principal / Math.max(1, months)
      results = [['每月还款', `¥${formatMoney(payment)}`], ['总利息', `¥${formatMoney(payment * months - principal)}`]]
    }
    if (type === 'compound') {
      const months = value('years') * 12; const rate = value('rate') / 100 / 12; let total = value('principal')
      for (let index = 0; index < months; index += 1) total = total * (1 + rate) + value('monthly')
      results = [['预计最终金额', `¥${formatMoney(total)}`], ['累计投入本金', `¥${formatMoney(value('principal') + value('monthly') * months)}`]]
    }
    if (type === 'emergency') results = [['建议应急金', `¥${formatMoney(value('monthly') * value('months'))}`], ['覆盖时间', `${value('months')} 个月`]]
    if (type === 'salary') results = [['必要支出 50%', `¥${formatMoney(value('income') * .5)}`], ['弹性消费 30%', `¥${formatMoney(value('income') * .3)}`], ['储蓄目标 20%', `¥${formatMoney(value('income') * .2)}`]]
    if (type === 'savings') results = [['每月需要存入', `¥${formatMoney(Math.max(0, value('target') - value('current')) / Math.max(1, value('months')))}`], ['还需积累', `¥${formatMoney(Math.max(0, value('target') - value('current')))}`]]
    if (type === 'repayment') {
      let debt = value('debt'); const rate = value('rate') / 100 / 12; const payment = value('payment'); let months = 0; let interest = 0
      while (debt > 0 && months < 600 && payment > debt * rate) { const fee = debt * rate; interest += fee; debt = Math.max(0, debt + fee - payment); months += 1 }
      results = payment <= value('debt') * rate ? [['当前方案', '月供不足以覆盖利息']] : [['预计还清时间', `${months} 个月`], ['预计总利息', `¥${formatMoney(interest)}`]]
    }
    el('calcResults').innerHTML = results.map(([label, result]) => `<div><span>${label}</span><b>${result}</b></div>`).join('')
  }

  function setGoalAmount(goalId, amount) {
    const goal = state.goals.find((item) => item.id === goalId)
    if (!goal || amount <= 0) return
    goal.current = Math.min(goal.target, roundMoney(goal.current + amount))
    closeModal(); render(); pulse('#goalProgress'); showToast(`目标已存入 ¥${formatMoney(amount)}`)
  }

  function parseCsvLine(line, delimiter) {
    const output = []; let value = ''; let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1 }
      else if (char === '"') quoted = !quoted
      else if (char === delimiter && !quoted) { output.push(value.trim()); value = '' }
      else value += char
    }
    output.push(value.trim())
    return output
  }

  function parseBillText(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
    const headerIndex = lines.findIndex((line) => /金额|交易时间|收\/支|类型|date|amount/i.test(line))
    if (headerIndex < 0) return []
    const delimiter = lines[headerIndex].includes('\t') ? '\t' : ','
    const headers = parseCsvLine(lines[headerIndex], delimiter)
    const findIndex = (...words) => headers.findIndex((header) => words.some((word) => header.toLowerCase().includes(word.toLowerCase())))
    const dateIndex = findIndex('交易时间', '时间', 'date')
    const amountIndex = findIndex('金额', 'amount')
    const typeIndex = findIndex('收/支', '收支', '类型', 'type')
    const noteIndex = findIndex('商品', '商户', '说明', '备注', 'note')
    if (amountIndex < 0) return []
    const rules = [
      ['餐饮', /美团|饿了么|餐厅|饭店|咖啡|奶茶|外卖|肯德基|麦当劳|瑞幸|星巴克/i],
      ['交通', /滴滴|地铁|公交|铁路|12306|出租|加油|停车|航空/i],
      ['购物', /淘宝|天猫|京东|拼多多|商城|商场/i],
      ['日用', /便利店|超市|盒马|永辉|沃尔玛|生活用品/i],
      ['娱乐', /腾讯视频|爱奇艺|网易云|游戏|电影|影院|ktv/i],
      ['居住', /房租|物业|水费|电费|燃气|宽带/i],
      ['学习', /课程|教育|书店|图书|培训|考试/i]
    ]
    const existingKeys = new Set(state.transactions.map((item) => item.importKey).filter(Boolean))
    return lines.slice(headerIndex + 1).map((line, index) => {
      const cells = parseCsvLine(line, delimiter)
      const amount = Math.abs(Number(String(cells[amountIndex] || '').replace(/[¥￥,元\s]/g, '')))
      if (!amount) return null
      const rawType = cells[typeIndex] || ''
      const type = /收入|income|入账/i.test(rawType) ? 'income' : 'expense'
      const rawDate = cells[dateIndex] || dateKey(today)
      const matched = rawDate.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
      const date = matched ? `${matched[1]}-${pad(matched[2])}-${pad(matched[3])}` : dateKey(today)
      const time = rawDate.match(/\d{1,2}:\d{2}/)?.[0] || '00:00'
      const note = cells[noteIndex] || '账单导入'
      const importKey = `${date}|${time}|${roundMoney(amount)}|${note}|${type}`
      if (existingKeys.has(importKey)) return null
      existingKeys.add(importKey)
      const predicted = type === 'income' ? (/工资|薪资/.test(note) ? '工资' : /退款|退回/.test(note) ? '退款' : '其他收入') : (rules.find(([, pattern]) => pattern.test(note)) || ['其他'])[0]
      return { id: `import-${Date.now()}-${index}`, type, amount: roundMoney(amount), category: predicted, accountId: state.accounts[0].id, note, date, time, source: 'bill', importKey, affectsBalance: false }
    }).filter(Boolean).slice(0, 200)
  }

  document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => { switchView(button.dataset.viewTarget); showToast(`已切换到${button.textContent.trim()}`) }))
  document.querySelectorAll('[data-chart-range]').forEach((button) => button.addEventListener('click', () => { state.chartRange = button.dataset.chartRange; render(); pulse('.capital-chart'); showToast(`曲线切换为 ${button.textContent.trim()}`) }))
  document.querySelectorAll('[data-ledger-view]').forEach((button) => button.addEventListener('click', () => { state.ledgerView = button.dataset.ledgerView; render(); showToast(`账本切换为${button.textContent.trim()}`) }))
  document.querySelectorAll('[data-ledger-filter]').forEach((button) => button.addEventListener('click', () => { state.ledgerFilter = button.dataset.ledgerFilter; render(); showToast(`筛选：${button.textContent.trim()}`) }))
  el('ledgerSearch').value = state.ledgerSearch || ''
  el('ledgerSearch').addEventListener('input', (event) => { state.ledgerSearch = event.target.value; renderTransactions(totals()); saveState() })
  document.querySelectorAll('[data-month-shift]').forEach((button) => button.addEventListener('click', () => { state.monthOffset += Number(button.dataset.monthShift); render(); showToast(button.dataset.monthShift === '1' ? '查看下个月' : '查看上个月') }))
  document.querySelectorAll('.type-switch button').forEach((button) => button.addEventListener('click', () => { state.type = button.dataset.type; state.category = state.type === 'income' ? incomeCategories[0] : state.type === 'transfer' ? '账户转账' : expenseCategories[0]; render(); showToast(`记账类型：${button.textContent.trim()}`) }))
  el('categoryGrid').addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (!button) return; state.category = button.dataset.category; renderCategories(); showToast(`已选择 ${state.category}`) })
  el('recordDate').value = dateKey(today)

  el('saveTransaction').addEventListener('click', () => {
    const amount = roundMoney(el('amountInput').value)
    if (amount <= 0) { el('demoFeedback').textContent = '请输入有效金额'; showToast('金额需要大于 0'); return }
    const accountId = el('accountSelect').value
    const toAccountId = el('targetAccountSelect').value
    if (!accountId || (state.type === 'transfer' && (!toAccountId || toAccountId === accountId))) { showToast('请选择不同的转出和转入账户'); return }
    const payload = { id: state.editingId || Date.now(), type: state.type, category: state.category, amount, accountId, toAccountId: state.type === 'transfer' ? toAccountId : '', note: el('noteInput').value.trim(), date: el('recordDate').value || dateKey(today), time: `${pad(today.getHours())}:${pad(today.getMinutes())}` }
    const editIndex = state.transactions.findIndex((item) => String(item.id) === String(state.editingId))
    if (editIndex >= 0) state.transactions.splice(editIndex, 1, payload); else state.transactions.unshift(payload)
    state.editingId = null
    state.monthOffset = 0
    const recordTask = state.tasks.find((item) => item.id === 'record'); if (recordTask && payload.date === dateKey(today)) recordTask.done = true
    el('demoFeedback').textContent = editIndex >= 0 ? '记录已更新' : '记录已保存'
    el('noteInput').value = ''
    render(); pulse('#totalFunds'); showToast(editIndex >= 0 ? '修改成功' : '记录成功，数据已更新')
    if (!el('continueMode').checked) window.setTimeout(() => switchView('home'), 450)
  })

  document.querySelectorAll('[data-demo-action="import"]').forEach((button) => button.addEventListener('click', () => { el('fundModal').hidden = false; window.setTimeout(() => el('fundAmount').focus(), 50) }))
  document.querySelectorAll('[data-demo-action="close-modal"]').forEach((button) => button.addEventListener('click', () => { el('fundModal').hidden = true }))
  el('confirmFunds').addEventListener('click', () => {
    const amount = roundMoney(el('fundAmount').value); if (amount <= 0) { showToast('请输入当前资金金额'); return }
    const name = el('fundName').value.trim() || '新账户'; state.accounts.push({ id: `account-${Date.now()}`, name, type: 'bank', balance: amount })
    el('fundModal').hidden = true; render(); pulse('#totalFunds'); showToast(`${name} 已导入 ¥${formatMoney(amount)}`)
  })
  el('fundModal').addEventListener('click', (event) => { if (event.target === el('fundModal')) el('fundModal').hidden = true })
  document.querySelector('[data-demo-action="profile"]').addEventListener('click', openProfile)
  document.querySelector('[data-demo-action="accounts"]').addEventListener('click', openAccounts)
  document.querySelectorAll('[data-demo-action="budget"]').forEach((button) => button.addEventListener('click', openBudget))
  document.querySelectorAll('[data-demo-action="goals"]').forEach((button) => button.addEventListener('click', openGoals))
  document.querySelector('[data-demo-action="privacy"]').addEventListener('click', () => { state.privacyMode = !state.privacyMode; render(); showToast(state.privacyMode ? '金额已隐藏' : '金额已显示') })
  document.querySelector('[data-demo-action="bill-import"]').addEventListener('click', () => el('billFileInput').click())
  document.querySelector('[data-demo-action="reset"]').addEventListener('click', () => { state = initialState(); render(); showToast('演示数据已恢复') })
  document.querySelector('[data-demo-action="close-app-modal"]').addEventListener('click', closeModal)
  el('appModal').addEventListener('click', (event) => { if (event.target === el('appModal')) closeModal() })

  el('transactionList').addEventListener('click', (event) => {
    const calendarDate = event.target.closest('[data-calendar-date]')
    if (calendarDate) { state.selectedDate = calendarDate.dataset.calendarDate; renderTransactions(totals()); saveState(); return }
    const row = event.target.closest('[data-transaction-id]')
    if (row) openTransaction(row.dataset.transactionId)
  })
  el('taskList').addEventListener('click', (event) => { const row = event.target.closest('[data-task-id]'); if (!row) return; const task = state.tasks.find((item) => item.id === row.dataset.taskId); if (task) task.done = !task.done; render(); showToast('行动进度已更新') })
  el('toolGrid').innerHTML = tools.map((tool) => `<button type="button" data-tool="${tool.type}"><b>${tool.icon}</b>${tool.name}</button>`).join('')
  el('toolGrid').addEventListener('click', (event) => { const button = event.target.closest('[data-tool]'); if (button) openCalculator(button.dataset.tool) })
  document.querySelectorAll('[data-lesson]').forEach((button) => button.addEventListener('click', () => { state.selectedLesson = button.dataset.lesson; const task = state.tasks.find((item) => item.id === 'lesson'); if (task) task.done = true; render(); showToast('已生成学习建议') }))
  el('depositGoal').addEventListener('click', () => state.goals[0] ? openDeposit(state.goals[0].id) : openGoalForm())

  el('appModalBody').addEventListener('click', (event) => {
    const editAccount = event.target.closest('[data-edit-account]'); if (editAccount) return openAccountForm(editAccount.dataset.editAccount)
    if (event.target.closest('[data-add-account]')) return openAccountForm()
    if (event.target.closest('[data-import-funds]')) { closeModal(); el('fundModal').hidden = false; window.setTimeout(() => el('fundAmount').focus(), 50); return }
    if (event.target.closest('[data-add-goal]')) return openGoalForm()
    const deposit = event.target.closest('[data-deposit-goal]'); if (deposit) return openDeposit(deposit.dataset.depositGoal)
    const depositValue = event.target.closest('[data-deposit-value]'); if (depositValue) return setGoalAmount(depositValue.dataset.goalId, Number(depositValue.dataset.depositValue))
    const profileAction = event.target.closest('[data-profile-action]')?.dataset.profileAction
    if (profileAction === 'accounts') return openAccounts()
    if (profileAction === 'budget') return openBudget()
    if (profileAction === 'goals') return openGoals()
    if (profileAction === 'privacy') { state.privacyMode = !state.privacyMode; render(); return openProfile() }
    if (profileAction === 'reset') { state = initialState(); closeModal(); render(); return showToast('演示数据已恢复') }
    const editTransaction = event.target.closest('[data-edit-transaction]')
    if (editTransaction) {
      const item = state.transactions.find((transaction) => String(transaction.id) === editTransaction.dataset.editTransaction)
      if (!item) return
      state.editingId = item.id; state.type = item.type; state.category = item.category; closeModal(); render(); switchView('add')
      el('amountInput').value = item.amount; el('noteInput').value = item.note || ''; el('recordDate').value = item.date; el('accountSelect').value = item.accountId; el('targetAccountSelect').value = item.toAccountId || ''
      el('demoFeedback').textContent = '正在编辑记录'; showToast('修改后点击完成记账')
      return
    }
    const deleteTransaction = event.target.closest('[data-delete-transaction]')
    if (deleteTransaction) {
      const index = state.transactions.findIndex((item) => String(item.id) === deleteTransaction.dataset.deleteTransaction)
      if (index < 0) return
      const [deleted] = state.transactions.splice(index, 1); closeModal(); render(); el('undoToast').hidden = false; el('undoToast').dataset.item = JSON.stringify(deleted); el('undoText').textContent = `已删除 ${deleted.category}`
      window.clearTimeout(el('undoToast').timer); el('undoToast').timer = window.setTimeout(() => { el('undoToast').hidden = true }, 4500)
      return
    }
    if (event.target.closest('[data-remove-account]')) {
      const id = el('accountForm').dataset.id
      if (state.transactions.some((item) => item.accountId === id || item.toAccountId === id)) return showToast('该账户已有流水，暂不能删除')
      state.accounts = state.accounts.filter((item) => item.id !== id); openAccounts(); render(); showToast('账户已删除')
    }
  })

  el('appModalBody').addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.target)
    if (event.target.id === 'accountForm') {
      const id = event.target.dataset.id; const current = state.accounts.find((item) => item.id === id); const currentComputed = current ? accountCurrentBalance(id) : 0
      const payload = { name: data.get('name').trim(), type: data.get('type'), balance: roundMoney(data.get('balance')) }
      if (!payload.name) return showToast('请输入账户名称')
      if (current) Object.assign(current, payload, { balance: roundMoney(payload.balance - (currentComputed - Number(current.balance || 0))) })
      else state.accounts.push({ id: `account-${Date.now()}`, ...payload })
      closeModal(); render(); showToast('账户已保存'); return
    }
    if (event.target.id === 'budgetForm') { state.budget = Math.max(0, roundMoney(data.get('amount'))); const task = state.tasks.find((item) => item.id === 'budget'); if (task) task.done = true; closeModal(); render(); showToast('预算已更新'); return }
    if (event.target.id === 'goalForm') { const target = roundMoney(data.get('target')); if (!target) return showToast('请输入目标金额'); state.goals.push({ id: `goal-${Date.now()}`, name: data.get('name').trim(), target, current: Math.min(target, roundMoney(data.get('current'))), deadline: data.get('deadline') }); closeModal(); render(); showToast('目标已创建'); return }
    if (event.target.id === 'depositForm') return setGoalAmount(data.get('goalId'), roundMoney(data.get('amount')))
    if (event.target.id === 'calculatorForm') calculate(event.target.dataset.type, data)
  })

  el('undoDelete').addEventListener('click', () => { const item = JSON.parse(el('undoToast').dataset.item || 'null'); if (item) state.transactions.unshift(item); el('undoToast').hidden = true; render(); showToast('记录已恢复') })
  el('billFileInput').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return
    try {
      showToast('正在本地解析账单…')
      const records = parseBillText(await file.text())
      if (!records.length) throw new Error('未识别到有效记录')
      openModal('账单导入预览', 'BILL IMPORT', `<p class="import-help">已识别 ${records.length} 笔记录。历史账单会参与收支统计，但不会重复改变当前账户余额。</p><div class="import-preview">${records.slice(0, 12).map((item) => `<div class="modal-row"><div><strong>${escapeHtml(item.note)}</strong><small>${item.date} · ${item.type === 'income' ? '收入' : '支出'}</small></div><span>¥${formatMoney(item.amount)}</span></div>`).join('')}</div><button class="modal-primary" type="button" id="confirmBillImport">确认导入 ${records.length} 笔</button>`)
      el('confirmBillImport').addEventListener('click', () => { state.transactions.push(...records); state.transactions.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)); closeModal(); render(); showToast(`成功导入 ${records.length} 笔账单`) }, { once: true })
    } catch (error) { showToast(error.message || '账单解析失败') }
    event.target.value = ''
  })

  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { el('fundModal').hidden = true; closeModal() } })
  const menu = document.querySelector('.menu'); const links = document.querySelector('.nav-links')
  menu.addEventListener('click', () => { const open = links.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)) })
  document.querySelectorAll('.nav-links a').forEach((link) => link.addEventListener('click', () => links.classList.remove('open')))
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('visible') }), { threshold: .12 })
  document.querySelectorAll('.reveal').forEach((item) => observer.observe(item))
  render()
})()
