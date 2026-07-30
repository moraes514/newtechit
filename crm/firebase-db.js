// ════════════════════════════════════════════════════════════════════════════
//  NEWTECHIT CRM — Módulo Firebase Database (Firestore + Auth)
//  Substitui localStorage por banco de dados em tempo real na nuvem
// ════════════════════════════════════════════════════════════════════════════

// ── Importações Firebase v9 (compat mode via CDN) ────────────────────────
// Este arquivo é carregado APÓS os scripts do Firebase no HTML

// Exporta funções para uso global nas páginas
window.FB = (() => {

  async function initFirebase() {
    if (typeof firebase !== 'undefined' && !firebase.apps.length && window.FIREBASE_CONFIG) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }
    if (typeof firebase !== 'undefined' && firebase.auth) {
      try {
        const auth = firebase.auth();
        if (!auth.currentUser) {
          await auth.signInAnonymously();
          console.log('✅ Firebase Auth: Conectado à nuvem');
        }
      } catch(e) {
        console.warn('Firebase Auth anonymous login warning:', e);
      }
    }
  }
  // Tenta conectar na carga do arquivo
  initFirebase().catch(e => console.error(e));

  function getDb() {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      if (typeof window !== 'undefined' && window.FIREBASE_CONFIG) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      } else {
        return null;
      }
    }
    return firebase.firestore();
  }

  function getAuth() {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
      if (typeof window !== 'undefined' && window.FIREBASE_CONFIG) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      } else {
        return null;
      }
    }
    return firebase.auth();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  HELPER: Normalizar ticket do Firestore para formato local esperado
  //  Converte campos do Firestore → formato que as dashboards entendem
  // ══════════════════════════════════════════════════════════════════════

  function normalizeTicket(data, docId) {
    // Converter createdAt (Firestore Timestamp ou ISO string) → date (YYYY-MM-DD)
    let dateStr = '';
    if (data.createdAt) {
      try {
        const dt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        dateStr = dt.toISOString().split('T')[0];
      } catch(e) {
        dateStr = data.date || '';
      }
    } else {
      dateStr = data.date || '';
    }

    return {
      // Usa o Document ID do Firestore como ID canônico
      id:          docId,
      // ticketNum mantém para exibição legível (#0001)
      ticketNum:   data.ticketNum || docId,
      title:       data.title || '',
      // 'client' é usado pela UI do staff para exibir nome do cliente
      client:      data.clientName || data.client || data.clientEmail || '',
      clientName:  data.clientName || data.client || '',
      clientEmail: data.clientEmail || data.client || '',
      company:     data.company || '',
      description: data.description || '',
      category:    data.category || 'Geral',
      priority:    data.priority || 'Média',
      status:      data.status || 'Aberto',
      date:        dateStr,
      assignee:    data.assignee || null,
      messages:    data.messages || [],
      // Manter campos originais do Firestore para referência
      createdAt:   data.createdAt || null,
      updatedAt:   data.updatedAt || null,
      resolvedAt:  data.resolvedAt || null
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  AUTENTICAÇÃO
  // ══════════════════════════════════════════════════════════════════════

  async function loginUser(email, password) {
    const auth = getAuth();
    const db   = getDb();
    if (!auth || !db) throw new Error('Firebase não inicializado.');
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const uid  = cred.user.uid;
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) throw new Error('Perfil de usuário não encontrado.');
    return { uid, email, ...snap.data() };
  }

  async function logoutUser() {
    const auth = getAuth();
    if (auth) await auth.signOut();
  }

  function onAuthChange(callback) {
    const auth = getAuth();
    if (!auth) { callback(null); return () => {}; }
    return auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) { callback(null); return; }
      try {
        const db   = getDb();
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

  async function updateUserProfile(email, data) {
    try {
      const db = getDb();
      if (!db) return;
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

  async function getTickets() {
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection('tickets').get();
    const tickets = snap.docs.map(d => normalizeTicket(d.data(), d.id));
    tickets.sort((a, b) => {
      const getTs = x => (x.createdAt?.seconds ? x.createdAt.seconds * 1000 : (x.createdAt ? new Date(x.createdAt).getTime() : 0));
      return getTs(b) - getTs(a);
    });
    return tickets;
  }

  async function getTicketsByCompany(company) {
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection('tickets').get();
    const tickets = snap.docs.map(d => normalizeTicket(d.data(), d.id)).filter(t => t.company === company);
    return tickets;
  }

  async function getTicketsByClient(clientEmail) {
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection('tickets').get();
    const tickets = snap.docs.map(d => normalizeTicket(d.data(), d.id)).filter(t => t.clientEmail === clientEmail || t.client === clientEmail);
    return tickets;
  }

  function onTicketsChange(callback, filterEmail = null) {
    const db = getDb();
    if (!db) return () => {};
    let query = db.collection('tickets');
    return query.onSnapshot(snap => {
      let tickets = snap.docs.map(d => normalizeTicket(d.data(), d.id));

      if (filterEmail) {
        tickets = tickets.filter(t => t.clientEmail === filterEmail || t.client === filterEmail);
      }

      // Ordena por data mais recente no JS (sem necessitar de índices compostos)
      tickets.sort((a, b) => {
        const getTs = x => (x.createdAt?.seconds ? x.createdAt.seconds * 1000 : (x.createdAt ? new Date(x.createdAt).getTime() : 0));
        return getTs(b) - getTs(a);
      });

      console.log(`📥 Sincronizado com Firebase Cloud: ${tickets.length} chamado(s) recebidos.`);
      callback(tickets);
    }, err => console.error('❌ Error no listener Firestore onTicketsChange:', err));
  }

  async function createTicket(data, session) {
    const db = getDb();
    if (!db) return null;
    const now = firebase.firestore.Timestamp.now();
    let newId = String(Date.now()).slice(-4);
    try {
      const countSnap = await db.collection('_meta').doc('ticketCount').get();
      const count = countSnap.exists ? (countSnap.data().count || 0) : 0;
      const newCount = count + 1;
      newId = String(newCount).padStart(4, '0');
      await db.collection('_meta').doc('ticketCount').set({ count: newCount });
    } catch(e) {
      console.warn('⚠️ Meta count warning (usando ID fallback):', e);
    }

    const ticket = {
      ticketNum:   newId,
      title:       data.title,
      description: data.description || '',
      clientEmail: data.clientEmail || session.email || '',
      clientName:  data.clientName  || session.name || '',
      company:     data.company     || session.company || '',
      category:    data.category || 'Geral',
      priority:    data.priority || 'Média',
      status:      data.status || 'Aberto',
      assignee:    data.assignee || null,
      createdAt:   now,
      updatedAt:   now,
      resolvedAt:  null,
      messages:    data.messages || []
    };

    const ref = await db.collection('tickets').add(ticket);
    // Retorna o ticket normalizado com o ID real do Firestore
    return normalizeTicket(ticket, ref.id);
  }

  async function updateTicketStatus(ticketId, status, assignee) {
    const db = getDb();
    if (!db) return;
    try {
      const update = {
        status,
        updatedAt: firebase.firestore.Timestamp.now()
      };
      if (assignee !== undefined) update.assignee = assignee;
      if (status === 'Resolvido' || status === 'Concluído') {
        update.resolvedAt = firebase.firestore.Timestamp.now();
      }
      const docRef = db.collection('tickets').doc(ticketId);
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.update(update);
      } else {
        // Fallback: busca por ticketNum para compatibilidade
        const querySnap = await db.collection('tickets').where('ticketNum', '==', ticketId).get();
        if (!querySnap.empty) {
          await querySnap.docs[0].ref.update(update);
        } else {
          console.warn('⚠️ Ticket não encontrado no Firebase para atualizar status:', ticketId);
        }
      }
    } catch(e) {
      console.error('Error updateTicketStatus:', e);
    }
  }

  async function sendMessage(ticketId, text, session, fromRole, newStatus) {
    const db = getDb();
    if (!db) return;
    try {
      const now  = new Date();
      const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const msg  = {
        from:  fromRole,
        name:  session.name,
        email: session.email,
        text,
        time,
        ts: Date.now()
      };

      const updateData = {
        messages: firebase.firestore.FieldValue.arrayUnion(msg),
        updatedAt: firebase.firestore.Timestamp.now()
      };

      // Se um novo status foi fornecido, atualiza junto com a mensagem
      if (newStatus) {
        updateData.status = newStatus;
      }

      const docRef = db.collection('tickets').doc(ticketId);
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.update(updateData);
      } else {
        // Fallback: busca por ticketNum para compatibilidade
        const querySnap = await db.collection('tickets').where('ticketNum', '==', ticketId).get();
        if (!querySnap.empty) {
          await querySnap.docs[0].ref.update(updateData);
        } else {
          console.warn('⚠️ Ticket não encontrado no Firebase para enviar mensagem:', ticketId);
        }
      }
    } catch(e) {
      console.error('Error sendMessage:', e);
    }
  }

  async function moveTicketStatus(ticketId, newStatus) {
    const db = getDb();
    if (!db) return;
    try {
      const updateData = {
        status: newStatus,
        updatedAt: firebase.firestore.Timestamp.now()
      };
      if (newStatus === 'Resolvido' || newStatus === 'Concluído') {
        updateData.resolvedAt = firebase.firestore.Timestamp.now();
      }
      const docRef = db.collection('tickets').doc(ticketId);
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.update(updateData);
      } else {
        // Fallback: busca por ticketNum para compatibilidade
        const querySnap = await db.collection('tickets').where('ticketNum', '==', ticketId).get();
        if (!querySnap.empty) {
          await querySnap.docs[0].ref.update(updateData);
        } else {
          console.warn('⚠️ Ticket não encontrado no Firebase para mover status:', ticketId);
        }
      }
    } catch(e) {
      console.error('Error moveTicketStatus:', e);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CONTRATOS (FINANCEIRO)
  // ══════════════════════════════════════════════════════════════════════

  async function getContracts() {
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection('contracts').orderBy('createdAt', 'desc').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function saveContract(data, editId = null) {
    const db = getDb();
    if (!db) return;
    const now = firebase.firestore.Timestamp.now();
    if (editId) {
      await db.collection('contracts').doc(editId).update({ ...data, updatedAt: now });
    } else {
      await db.collection('contracts').add({ ...data, createdAt: now, updatedAt: now });
    }
  }

  async function markContractPaid(contractId) {
    const db = getDb();
    if (!db) return;
    await db.collection('contracts').doc(contractId).update({
      payStatus:   'Pago',
      lastPayment: new Date().toISOString().split('T')[0],
      updatedAt:   firebase.firestore.Timestamp.now()
    });
  }

  async function deleteContract(contractId) {
    const db = getDb();
    if (!db) return;
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
    const db = getDb();
    if (!db) return { company: company || 'Todas as Empresas', year, month, total: 0, abertos: 0, andamento: 0, resolvidos: 0, byCat: {}, byPrio: {}, avgResolutionHours: null, tickets: [] };
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
        const resolvedAt = t.resolvedAt?.toDate ? t.resolvedAt.toDate() : new Date(t.resolvedAt);
        return sum + (resolvedAt - created);
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
    const db = getDb();
    if (!db) return [];
    const snap = await db.collection('tickets').get();
    const companies = [...new Set(snap.docs.map(d => d.data().company).filter(Boolean))];
    return companies.sort();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  SEED DE DADOS INICIAIS (só roda uma vez)
  // ══════════════════════════════════════════════════════════════════════

  async function seedInitialData() {
    const db = getDb();
    if (!db) return;
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
    sendMessage, moveTicketStatus,
    // Contratos
    getContracts, saveContract, markContractPaid, deleteContract,
    // Relatórios
    getMonthlyReport, getCompanies,
    // Setup
    seedInitialData,
    // Helper
    normalizeTicket,
    // Acesso direto ao firestore e auth para casos específicos
    getDb, getAuth
  };

})();
