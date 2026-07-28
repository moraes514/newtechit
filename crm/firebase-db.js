// ════════════════════════════════════════════════════════════════════════════
//  NEWTECHIT CRM — Módulo Firebase Database (Firestore + Auth)
//  Substitui localStorage por banco de dados em tempo real na nuvem
// ════════════════════════════════════════════════════════════════════════════

// ── Importações Firebase v9 (compat mode via CDN) ────────────────────────
// Este arquivo é carregado APÓS os scripts do Firebase no HTML

// Exporta funções para uso global nas páginas
window.FB = (() => {

  // ── Referências Firestore ───────────────────────────────────────────────
  const db   = firebase.firestore();
  const auth = firebase.auth();

  // ══════════════════════════════════════════════════════════════════════
  //  AUTENTICAÇÃO
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Login com email/senha via Firebase Auth
   * @returns {Promise<{uid, email, role, name, avatar, company, plan}>}
   */
  async function loginUser(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const uid  = cred.user.uid;
    // Busca perfil do usuário no Firestore
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) throw new Error('Perfil de usuário não encontrado.');
    return { uid, email, ...snap.data() };
  }

  /**
   * Logout do Firebase Auth
   */
  async function logoutUser() {
    await auth.signOut();
  }

  /**
   * Observa mudança de estado de autenticação
   * @param {Function} callback - chamado com (user|null)
   */
  function onAuthChange(callback) {
    return auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) { callback(null); return; }
      try {
        const snap = await db.collection('users').doc(firebaseUser.uid).get();
        if (snap.exists) {
          callback({ uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() });
        } else {
          callback(null);
        }
      } catch(e) {
        console.error('Erro ao buscar perfil:', e);
        callback(null);
      }
    });
  }

  /**
   * Atualiza perfil do usuário no Firestore
   */
  async function updateUserProfile(email, data) {
    try {
      const snap = await db.collection('users').where('email', '==', email).get();
      const batch = db.batch();
      if (!snap.empty) {
        snap.docs.forEach(doc => {
          batch.set(doc.ref, { ...data, updatedAt: firebase.firestore.Timestamp.now() }, { merge: true });
        });
      } else {
        const ref = db.collection('users').doc(email);
        batch.set(ref, { email, ...data, updatedAt: firebase.firestore.Timestamp.now() }, { merge: true });
      }
      await batch.commit();
    } catch(e) {
      console.error('Erro ao atualizar perfil no Firestore:', e);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  TICKETS (CHAMADOS)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Busca todos os tickets do Firestore (uma vez)
   */
  async function getTickets() {
    const snap = await db.collection('tickets').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /**
   * Busca tickets de uma empresa específica
   */
  async function getTicketsByCompany(company) {
    const snap = await db.collection('tickets')
      .where('company', '==', company)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /**
   * Busca tickets de um cliente (por email)
   */
  async function getTicketsByClient(clientEmail) {
    const snap = await db.collection('tickets')
      .where('clientEmail', '==', clientEmail)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /**
   * Observa tickets em tempo real (para staff - todos os tickets)
   */
  function onTicketsChange(callback, filterEmail = null) {
    let query = db.collection('tickets').orderBy('createdAt', 'desc');
    if (filterEmail) query = query.where('clientEmail', '==', filterEmail);
    return query.onSnapshot(snap => {
      const tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(tickets);
    }, err => console.error('onTicketsChange error:', err));
  }

  /**
   * Cria um novo ticket
   */
  async function createTicket(data, session) {
    const now = firebase.firestore.Timestamp.now();
    // Gera ID sequencial baseado em count
    const countSnap = await db.collection('_meta').doc('ticketCount').get();
    const count = countSnap.exists ? (countSnap.data().count || 0) : 0;
    const newCount = count + 1;
    const newId    = String(newCount).padStart(4, '0');

    await db.collection('_meta').doc('ticketCount').set({ count: newCount });

    const ticket = {
      ticketNum:   newId,
      title:       data.title,
      description: data.description || '',
      clientEmail: data.clientEmail || session.email,
      clientName:  data.clientName  || session.name,
      company:     data.company     || session.company || '',
      category:    data.category,
      priority:    data.priority,
      status:      data.status || 'Aberto',
      assignee:    data.assignee || null,
      createdAt:   now,
      updatedAt:   now,
      resolvedAt:  null,
      messages:    data.messages || []
    };

    const ref = await db.collection('tickets').add(ticket);
    return { id: ref.id, ticketNum: newId, ...ticket };
  }

  /**
   * Atualiza status e responsável de um ticket
   */
  async function updateTicketStatus(ticketId, status, assignee) {
    const update = {
      status,
      updatedAt: firebase.firestore.Timestamp.now()
    };
    if (assignee !== undefined) update.assignee = assignee;
    if (status === 'Resolvido' || status === 'Concluído') {
      update.resolvedAt = firebase.firestore.Timestamp.now();
    }
    await db.collection('tickets').doc(ticketId).update(update);
  }

  /**
   * Envia mensagem em um ticket (chat em tempo real)
   */
  async function sendMessage(ticketId, text, session, fromRole) {
    const now  = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const msg  = {
      from:  fromRole, // 'client' ou 'staff'
      name:  session.name,
      email: session.email,
      text,
      time,
      ts: firebase.firestore.Timestamp.now()
    };
    await db.collection('tickets').doc(ticketId).update({
      messages:  firebase.firestore.FieldValue.arrayUnion(msg),
      updatedAt: firebase.firestore.Timestamp.now()
    });
  }

  /**
   * Observa mensagens de um ticket em tempo real
   */
  function onTicketMessages(ticketId, callback) {
    return db.collection('tickets').doc(ticketId).onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      callback(data.messages || [], data);
    });
  }

  /**
   * Move ticket de coluna (Kanban drag & drop)
   */
  async function moveTicketStatus(ticketId, newStatus) {
    await db.collection('tickets').doc(ticketId).update({
      status:    newStatus,
      updatedAt: firebase.firestore.Timestamp.now()
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CONTRATOS (FINANCEIRO)
  // ══════════════════════════════════════════════════════════════════════

  async function getContracts() {
    const snap = await db.collection('contracts').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function saveContract(data, editId = null) {
    const now = firebase.firestore.Timestamp.now();
    if (editId) {
      await db.collection('contracts').doc(editId).update({ ...data, updatedAt: now });
    } else {
      await db.collection('contracts').add({ ...data, createdAt: now, updatedAt: now });
    }
  }

  async function markContractPaid(contractId) {
    await db.collection('contracts').doc(contractId).update({
      payStatus:   'Pago',
      lastPayment: new Date().toISOString().split('T')[0],
      updatedAt:   firebase.firestore.Timestamp.now()
    });
  }

  async function deleteContract(contractId) {
    await db.collection('contracts').doc(contractId).delete();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  RELATÓRIOS MENSAIS
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Gera dados do relatório mensal para uma empresa e mês
   * @param {string} company - nome da empresa (vazio = todas)
   * @param {number} year  - ex: 2025
   * @param {number} month - 1-12
   */
  async function getMonthlyReport(company, year, month) {
    let query = db.collection('tickets');
    if (company) query = query.where('company', '==', company);

    const snap = await query.get();
    const allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filtra pelo mês
    const tickets = allTickets.filter(t => {
      const ts = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
      return ts.getFullYear() === year && (ts.getMonth() + 1) === month;
    });

    // Totais por status
    const abertos    = tickets.filter(t => t.status === 'Aberto' || t.status === 'A Fazer').length;
    const andamento  = tickets.filter(t => t.status === 'Em Andamento' || t.status === 'Em Revisão').length;
    const resolvidos = tickets.filter(t => t.status === 'Resolvido' || t.status === 'Concluído').length;
    const total      = tickets.length;

    // Por categoria
    const byCat = {};
    tickets.forEach(t => {
      byCat[t.category] = (byCat[t.category] || 0) + 1;
    });

    // Por prioridade
    const byPrio = {};
    tickets.forEach(t => {
      byPrio[t.priority] = (byPrio[t.priority] || 0) + 1;
    });

    // Tempo médio de resolução (em horas)
    const resolved = tickets.filter(t => t.resolvedAt && t.createdAt);
    let avgResolutionHours = null;
    if (resolved.length > 0) {
      const totalMs = resolved.reduce((sum, t) => {
        const created  = t.createdAt?.toDate  ? t.createdAt.toDate()  : new Date(t.createdAt);
        const resolved = t.resolvedAt?.toDate ? t.resolvedAt.toDate() : new Date(t.resolvedAt);
        return sum + (resolved - created);
      }, 0);
      avgResolutionHours = Math.round((totalMs / resolved.length) / 3600000 * 10) / 10;
    }

    return {
      company: company || 'Todas as Empresas',
      year, month,
      total, abertos, andamento, resolvidos,
      byCat, byPrio,
      avgResolutionHours,
      tickets
    };
  }

  /**
   * Lista todas as empresas cadastradas (de tickets)
   */
  async function getCompanies() {
    const snap = await db.collection('tickets').get();
    const companies = [...new Set(snap.docs.map(d => d.data().company).filter(Boolean))];
    return companies.sort();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SEED DE DADOS INICIAIS (só roda uma vez)
  // ══════════════════════════════════════════════════════════════════════

  async function seedInitialData() {
    const metaSnap = await db.collection('_meta').doc('seeded').get();
    if (metaSnap.exists) return; // já semeado

    // Seed inicial zerado para produção
    const sampleTickets = [];

    const batch = db.batch();
    batch.set(db.collection('_meta').doc('ticketCount'), { count: 0 });
    batch.set(db.collection('_meta').doc('seeded'), { at: firebase.firestore.Timestamp.now() });
    await batch.commit();
    console.log('✅ Sistema inicializado para produção');
  }

  // ── API pública ─────────────────────────────────────────────────────────
  return {
    // Auth
    loginUser, logoutUser, onAuthChange, updateUserProfile,
    // Tickets
    getTickets, getTicketsByCompany, getTicketsByClient,
    onTicketsChange, createTicket, updateTicketStatus,
    sendMessage, onTicketMessages, moveTicketStatus,
    // Contratos
    getContracts, saveContract, markContractPaid, deleteContract,
    // Relatórios
    getMonthlyReport, getCompanies,
    // Setup
    seedInitialData,
    // Acesso direto ao firestore e auth para casos específicos
    db, auth
  };

})();
