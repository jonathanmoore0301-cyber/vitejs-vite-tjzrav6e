import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const APPROVED_EMAIL = 'jonathanmoore@nerdicomp.com'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const [jobFilter, setJobFilter] = useState('Open')
  const [jobs, setJobs] = useState([])
  const [jobEdits, setJobEdits] = useState({})
  const [savingJobId, setSavingJobId] = useState(null)

  const [notificationText, setNotificationText] = useState('')
  const initialLoadDone = useRef(false)

  const [jobForm, setJobForm] = useState({
    ticket_number: '',
    client_name: '',
    location: '',
    issue: '',
    assigned_tech: '',
    status: 'New',
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session?.user?.email === APPROVED_EMAIL) {
        fetchJobs()
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user?.email === APPROVED_EMAIL) {
        fetchJobs()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || session.user.email !== APPROVED_EMAIL) return
  
    const channel = supabase
      .channel('jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
        },
        (payload) => {
          fetchJobs()
  
          if (!initialLoadDone.current) return
  
          if (payload.eventType === 'INSERT') {
            const newJob = payload.new
            const text = `New job received: ${newJob.ticket_number} - ${newJob.client_name}`
            showInAppNotification(text)
            showBrowserNotification('NERDI Dispatch', text)
          }
  
          if (payload.eventType === 'UPDATE') {
            const oldJob = payload.old
            const newJob = payload.new
  
            if (oldJob.status !== newJob.status) {
              showInAppNotification(
                `Status Update: ${newJob.ticket_number} → ${newJob.status}`
              )
            }
  
            if (oldJob.assigned_tech !== newJob.assigned_tech) {
              showInAppNotification(
                `Assigned: ${newJob.ticket_number} → ${newJob.assigned_tech || 'Unassigned'}`
              )
            }
          }
        }
      )
      .subscribe()
  
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  useEffect(() => {
    initialLoadDone.current = true
  }, [jobs])

  async function fetchJobs() {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching jobs:', error.message)
      setMessage(error.message)
      return
    }

    const fetchedJobs = data || []
    setJobs(fetchedJobs)

    const editState = {}
    fetchedJobs.forEach((job) => {
      editState[job.id] = {
        client_name: job.client_name || '',
        assigned_tech: job.assigned_tech || '',
        status: job.status || 'New',
      }
    })
    setJobEdits(editState)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function handleChange(e) {
    const { name, value } = e.target
    setJobForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  async function handleCreateJob(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.from('jobs').insert([jobForm])

    if (error) {
      setMessage(error.message)
      return
    }

    setJobForm({
      ticket_number: '',
      client_name: '',
      location: '',
      issue: '',
      assigned_tech: '',
      status: 'New',
    })
  }

  function handleEditChange(jobId, field, value) {
    setJobEdits((prev) => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        [field]: value,
      },
    }))
  }

  async function saveJobChanges(jobId) {
    const edits = jobEdits[jobId]
    if (!edits) return

    setSavingJobId(jobId)
    setMessage('')

    const { error } = await supabase
      .from('jobs')
      .update({
        client_name: edits.client_name,
        assigned_tech: edits.assigned_tech,
        status: edits.status,
      })
      .eq('id', jobId)

    if (error) {
      console.error('Error saving job:', error.message)
      setMessage(error.message)
      setSavingJobId(null)
      return
    }

    setJobs((prevJobs) =>
      prevJobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              client_name: edits.client_name,
              assigned_tech: edits.assigned_tech,
              status: edits.status,
            }
          : job
      )
    )

    const savedJob = jobs.find((job) => job.id === jobId)
    if (savedJob) {
      showInAppNotification(
        `Saved changes: ${savedJob.ticket_number} is now ${edits.status}`
      )
    }

    setSavingJobId(null)
    fetchJobs()
  }

  async function enableNotifications() {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications.')
      return
    }

    const permission = await Notification.requestPermission()

    if (permission === 'granted') {
      showInAppNotification('Browser notifications enabled.')
    } else {
      showInAppNotification('Browser notifications were denied.')
    }
  }

  function showInAppNotification(text) {
    setNotificationText(text)
    setTimeout(() => {
      setNotificationText('')
    }, 5000)
  }

  function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  }

  const filteredJobs = jobs.filter((job) => {
    if (jobFilter === 'All') return true
    if (jobFilter === 'Completed') return job.status === 'Completed'
    return job.status !== 'Completed'
  })

  const openCount = jobs.filter((job) => job.status !== 'Completed').length
  const completedCount = jobs.filter((job) => job.status === 'Completed').length
  const allCount = jobs.length

  if (loading) {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.card}>
          <h2>Loading...</h2>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={loginStyles.container}>
        <div style={loginStyles.card}>
  
          <div style={loginStyles.logoSection}>
            <img
              src="/icon-192.png"
              alt="NERDI Logo"
              style={loginStyles.logo}
            />
            <h1 style={loginStyles.title}>NERDI</h1>
            <p style={loginStyles.subtitle}>
              Smart IT. Smarter Solutions.
            </p>
          </div>
  
          <form onSubmit={handleLogin} style={loginStyles.form}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={loginStyles.input}
              required
            />
  
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={loginStyles.input}
              required
            />
  
            <button type="submit" style={loginStyles.button}>
              Sign In
            </button>
          </form>
  
          {message && <p style={loginStyles.error}>{message}</p>}
        </div>
      </div>
    )
  }

  if (session.user.email !== APPROVED_EMAIL) {
    return (
      <div style={styles.centerScreen}>
        <div style={styles.card}>
          <h1 style={styles.title}>Access Denied</h1>
          <p style={styles.subtitle}>
            This account is not authorized to view the dashboard.
          </p>
          <button onClick={handleLogout} style={styles.button}>
            Log Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.appShell}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.dashboardTitle}>NERDI Dispatch Dashboard</h1>
          <p style={styles.loggedInAs}>Logged in as: {session.user.email}</p>
        </div>

        <div style={styles.headerButtons}>
          <button onClick={enableNotifications} style={styles.notifyButton}>
            Enable Notifications
          </button>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Log Out
          </button>
        </div>
      </header>

      {notificationText && (
        <div style={styles.notificationBanner}>
          {notificationText}
        </div>
      )}

      <main style={styles.main}>
        <section style={styles.dashboardCard}>
          <h2>Create Job</h2>
          <form onSubmit={handleCreateJob} style={styles.gridForm}>
            <input
              name="ticket_number"
              placeholder="Ticket Number"
              value={jobForm.ticket_number}
              onChange={handleChange}
              style={styles.input}
              required
            />
            <input
              name="client_name"
              placeholder="Client Name"
              value={jobForm.client_name}
              onChange={handleChange}
              style={styles.input}
              required
            />
            <input
              name="location"
              placeholder="Location"
              value={jobForm.location}
              onChange={handleChange}
              style={styles.input}
            />
            <input
              name="assigned_tech"
              placeholder="Assigned Tech"
              value={jobForm.assigned_tech}
              onChange={handleChange}
              style={styles.input}
            />
            <select
              name="status"
              value={jobForm.status}
              onChange={handleChange}
              style={styles.input}
            >
              <option value="New">New</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>
            <textarea
              name="issue"
              placeholder="Issue Description"
              value={jobForm.issue}
              onChange={handleChange}
              style={styles.textarea}
              required
            />
            <button type="submit" style={styles.button}>
              Create Job
            </button>
          </form>
          {message && <p style={styles.error}>{message}</p>}
        </section>

        <section style={styles.dashboardCard}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Jobs</h2>

            <div style={styles.filterGroup}>
              <button
                onClick={() => setJobFilter('Open')}
                style={{
                  ...styles.filterButton,
                  ...(jobFilter === 'Open' ? styles.filterButtonActive : {}),
                }}
              >
                Open ({openCount})
              </button>

              <button
                onClick={() => setJobFilter('Completed')}
                style={{
                  ...styles.filterButton,
                  ...(jobFilter === 'Completed' ? styles.filterButtonActive : {}),
                }}
              >
                Completed ({completedCount})
              </button>

              <button
                onClick={() => setJobFilter('All')}
                style={{
                  ...styles.filterButton,
                  ...(jobFilter === 'All' ? styles.filterButtonActive : {}),
                }}
              >
                All ({allCount})
              </button>
            </div>
          </div>

          <div style={styles.jobList}>
            {filteredJobs.length === 0 ? (
              <p>No jobs in this view.</p>
            ) : (
              filteredJobs.map((job) => {
                const edits = jobEdits[job.id] || {
                  client_name: job.client_name || '',
                  assigned_tech: job.assigned_tech || '',
                  status: job.status || 'New',
                }

                return (
                  <div key={job.id} style={styles.jobCard}>
                    <div style={styles.jobTop}>
                      <div>
                        <h3 style={styles.jobTitle}>{job.ticket_number}</h3>
                        <p style={styles.jobMeta}>
                          {job.location ? job.location : 'No location'}
                        </p>
                      </div>
                      <small style={styles.jobDate}>
                        {new Date(job.created_at).toLocaleString()}
                      </small>
                    </div>

                    <p style={styles.jobIssue}>{job.issue}</p>

                    <div style={styles.editGrid}>
                      <div>
                        <label style={styles.fieldLabel}>Client Name</label>
                        <input
                          value={edits.client_name}
                          onChange={(e) =>
                            handleEditChange(job.id, 'client_name', e.target.value)
                          }
                          style={styles.input}
                        />
                      </div>

                      <div>
                        <label style={styles.fieldLabel}>Assigned Tech</label>
                        <input
                          value={edits.assigned_tech}
                          onChange={(e) =>
                            handleEditChange(job.id, 'assigned_tech', e.target.value)
                          }
                          style={styles.input}
                        />
                      </div>

                      <div>
                        <label style={styles.fieldLabel}>Status</label>
                        <select
                          value={edits.status}
                          onChange={(e) =>
                            handleEditChange(job.id, 'status', e.target.value)
                          }
                          style={styles.input}
                        >
                          <option value="New">New</option>
                          <option value="Assigned">Assigned</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="On Hold">On Hold</option>
                        </select>
                      </div>
                    </div>

                    <div style={styles.jobActions}>
                      <button
                        onClick={() => saveJobChanges(job.id)}
                        style={styles.saveButton}
                        disabled={savingJobId === job.id}
                      >
                        {savingJobId === job.id ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

const loginStyles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#ffffff',
    borderRadius: '20px',
    padding: '40px 32px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  logoSection: {
    marginBottom: '28px',
  },
  logo: {
    width: '70px',
    marginBottom: '14px',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '1px',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: '6px',
    fontSize: '14px',
    color: '#64748b',
    letterSpacing: '0.5px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginTop: '10px',
  },
  input: {
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    fontSize: '15px',
    transition: 'all 0.2s ease',
  },
  button: {
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '6px',
  },
  error: {
    marginTop: '16px',
    color: '#dc2626',
    fontSize: '14px',
  },
}

const styles = {
  centerScreen: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f4f7fb',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: '#ffffff',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  title: {
    marginBottom: '8px',
    color: '#0f172a',
  },
  subtitle: {
    marginBottom: '24px',
    color: '#475569',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  gridForm: {
    display: 'grid',
    gap: '14px',
  },
  input: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    fontSize: '16px',
    width: '100%',
  },
  textarea: {
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    fontSize: '16px',
    minHeight: '110px',
    width: '100%',
    resize: 'vertical',
  },
  button: {
    padding: '14px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontSize: '16px',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '12px 16px',
    borderRadius: '10px',
    border: 'none',
    background: '#0f172a',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  notifyButton: {
    padding: '10px 16px',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
  },
  error: {
    marginTop: '16px',
    color: '#dc2626',
  },
  appShell: {
    minHeight: '100vh',
    background: '#f8fafc',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 30px',
    background: '#ffffff',
    borderBottom: '1px solid #e2e8f0',
    gap: '16px',
    flexWrap: 'wrap',
  },
  headerButtons: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  dashboardTitle: {
    margin: 0,
    color: '#0f172a',
  },
  loggedInAs: {
    margin: '6px 0 0 0',
    color: '#64748b',
    fontSize: '14px',
  },
  logoutButton: {
    padding: '10px 16px',
    borderRadius: '10px',
    border: 'none',
    background: '#0f172a',
    color: '#fff',
    cursor: 'pointer',
  },
  notificationBanner: {
    margin: '16px 30px 0 30px',
    padding: '14px 16px',
    borderRadius: '12px',
    background: '#dbeafe',
    color: '#1e3a8a',
    fontWeight: '600',
  },
  main: {
    padding: '30px',
    display: 'grid',
    gap: '24px',
  },
  dashboardCard: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
  },
  jobList: {
    display: 'grid',
    gap: '16px',
    marginTop: '16px',
  },
  jobCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    padding: '18px',
    background: '#fff',
  },
  jobTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'flex-start',
  },
  jobTitle: {
    margin: 0,
    color: '#0f172a',
  },
  jobMeta: {
    margin: '6px 0 0 0',
    color: '#64748b',
  },
  jobDate: {
    color: '#94a3b8',
  },
  jobIssue: {
    margin: '14px 0',
    color: '#334155',
  },
  editGrid: {
    display: 'grid',
    gap: '14px',
    marginTop: '12px',
  },
  fieldLabel: {
    display: 'block',
    marginBottom: '6px',
    color: '#334155',
    fontSize: '14px',
    fontWeight: '600',
  },
  jobActions: {
    marginTop: '14px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: 0,
    color: '#0f172a',
  },
  filterGroup: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  filterButton: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#334155',
    cursor: 'pointer',
    fontWeight: '600',
  },
  filterButtonActive: {
    background: '#2563eb',
    color: '#ffffff',
    border: '1px solid #2563eb',
  },
}