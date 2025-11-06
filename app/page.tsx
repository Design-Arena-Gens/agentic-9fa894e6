"use client";

import dynamic from 'next/dynamic';
import styles from './page.module.css';
const VideoCreator = dynamic(() => import('../components/VideoCreator'), { ssr: false });

export default function Page() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Instant Video Creator</h1>
      <p className={styles.subtitle}>Compose slides with text and images, then export to WebM.</p>
      <VideoCreator />
      <footer className={styles.footer}>
        <span>Works entirely in your browser. No uploads.</span>
      </footer>
    </main>
  );
}
