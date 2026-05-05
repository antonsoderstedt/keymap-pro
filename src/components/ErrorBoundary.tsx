import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-8 flex flex-col items-center justify-center min-h-48 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive/60" />
          <div>
            <p className="font-medium">Något gick fel i den här sektionen.</p>
            <p className="text-sm text-muted-foreground mt-1">
              {this.state.error?.message ?? "Okänt fel"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Försök igen
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
