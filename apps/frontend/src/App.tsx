import { Routes, Route } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { HomePage } from "@/pages/HomePage";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
