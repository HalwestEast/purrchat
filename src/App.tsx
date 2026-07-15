import { Authenticated, Unauthenticated } from "convex/react";
import ConversationContainer from "./components/conversation";
import SignInForm from "./components/sign-in-form";

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-stone-50">
      <Authenticated>
        <ConversationContainer />
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </div>
  );
}
