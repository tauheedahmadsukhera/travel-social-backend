/**
 * Firebase Usage Monitor
 * 
 * Tracks Firestore reads/writes to help monitor costs
 * Enable in development to see usage patterns
 */

interface UsageStats {
  reads: number;
  writes: number;
  deletes: number;
  listeners: number;
  startTime: number;
}

class FirebaseUsageMonitor {
  private stats: UsageStats = {
    reads: 0,
    writes: 0,
    deletes: 0,
    listeners: 0,
    startTime: Date.now(),
  };

  private enabled: boolean = __DEV__; // Only in development

  /**
   * Track a read operation
   */
  trackRead(count: number = 1, source?: string) {
    if (!this.enabled) return;
    this.stats.reads += count;
    if (source) {
      console.log(`📖 Read (${count}): ${source}`);
    }
  }

  /**
   * Track a write operation
   */
  trackWrite(count: number = 1, source?: string) {
    if (!this.enabled) return;
    this.stats.writes += count;
    if (source) {
      console.log(`✍️ Write (${count}): ${source}`);
    }
  }

  /**
   * Track a delete operation
   */
  trackDelete(count: number = 1, source?: string) {
    if (!this.enabled) return;
    this.stats.deletes += count;
    if (source) {
      console.log(`🗑️ Delete (${count}): ${source}`);
    }
  }

  /**
   * Track a listener
   */
  trackListener(active: boolean, source?: string) {
    if (!this.enabled) return;
    if (active) {
      this.stats.listeners++;
      if (source) {
        console.log(`👂 Listener started: ${source}`);
      }
    } else {
      this.stats.listeners--;
      if (source) {
        console.log(`👂 Listener stopped: ${source}`);
      }
    }
  }

  /**
   * Get current stats
   */
  getStats(): UsageStats & { duration: number; estimatedCost: number } {
    const duration = Date.now() - this.stats.startTime;
    
    // Rough cost estimation (Firebase pricing as of 2024)
    // Reads: $0.06 per 100K reads
    // Writes: $0.18 per 100K writes
    // Deletes: $0.02 per 100K deletes
    const estimatedCost = 
      (this.stats.reads * 0.06 / 100000) +
      (this.stats.writes * 0.18 / 100000) +
      (this.stats.deletes * 0.02 / 100000);

    return {
      ...this.stats,
      duration,
      estimatedCost,
    };
  }

  /**
   * Print stats to console
   */
  printStats() {
    if (!this.enabled) return;

    const stats = this.getStats();
    const durationMinutes = Math.round(stats.duration / 60000);

    console.log('\n📊 Firebase Usage Stats:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📖 Reads: ${stats.reads.toLocaleString()}`);
    console.log(`✍️ Writes: ${stats.writes.toLocaleString()}`);
    console.log(`🗑️ Deletes: ${stats.deletes.toLocaleString()}`);
    console.log(`👂 Active Listeners: ${stats.listeners}`);
    console.log(`⏱️ Duration: ${durationMinutes} minutes`);
    console.log(`💰 Estimated Cost: $${stats.estimatedCost.toFixed(4)}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Reset stats
   */
  reset() {
    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      listeners: 0,
      startTime: Date.now(),
    };
    console.log('✅ Usage stats reset');
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log(`📊 Usage monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get recommendations based on usage
   */
  getRecommendations(): string[] {
    const stats = this.getStats();
    const recommendations: string[] = [];

    // High read count
    if (stats.reads > 1000) {
      recommendations.push('⚠️ High read count detected. Consider implementing caching.');
    }

    // Active listeners
    if (stats.listeners > 5) {
      recommendations.push('⚠️ Multiple active listeners detected. Consider using polling instead.');
    }

    // High write count
    if (stats.writes > 500) {
      recommendations.push('⚠️ High write count detected. Consider batching writes.');
    }

    return recommendations;
  }
}

// Singleton instance
export const usageMonitor = new FirebaseUsageMonitor();

// Auto-print stats every 5 minutes in development
if (__DEV__) {
  setInterval(() => {
    usageMonitor.printStats();
    const recommendations = usageMonitor.getRecommendations();
    if (recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      recommendations.forEach(rec => console.log(rec));
    }
  }, 5 * 60 * 1000); // 5 minutes
}

