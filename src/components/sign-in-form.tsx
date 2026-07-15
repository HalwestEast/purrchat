import { useAuthActions } from "@convex-dev/auth/react";

export default function SignInForm() {
  const { signIn } = useAuthActions();

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      {/* Card */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-xl shadow-stone-200/80 ring-1 ring-stone-100">
        {/* Decorative top bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-pink-400" />

        <div className="px-8 py-10">
          {/* Logo / icon */}
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-violet-200">
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight text-stone-800">
              Messages
            </span>
          </div>

          {/* Heading */}
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-stone-900">
            Welcome back
          </h1>
          <p className="mb-8 text-sm text-stone-400">
            Sign in to continue your conversations.
          </p>

          {/* Google button */}
          <button
            onClick={() => void signIn("google")}
            className="group flex w-full items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow-sm transition-all duration-150 hover:border-stone-300 hover:bg-stone-50 hover:shadow-md active:scale-[0.98]"
          >
            {/* Google logo SVG */}
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-stone-400">
            By signing in you agree to our{" "}
            <span className="text-stone-500 underline underline-offset-2 cursor-pointer hover:text-stone-700">
              Terms
            </span>
            {" & "}
            <span className="text-stone-500 underline underline-offset-2 cursor-pointer hover:text-stone-700">
              Privacy
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
