import styles from './page.module.css';

export default function AdminHomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1>VSP Phone v4 Admin</h1>
        <p>Phase 10 browser softphone — SIP.js over WSS with JWT enrollment.</p>
        <p>
          <a href="/softphone">Open Browser Softphone →</a>
        </p>
      </section>
    </main>
  );
}
