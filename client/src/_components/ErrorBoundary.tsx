import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface State {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    // Log error to service if needed
    // console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong.</Text>
          <Text style={styles.error}>{String(this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#d00',
    marginBottom: 12,
  },
  error: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
});

export default ErrorBoundary;
