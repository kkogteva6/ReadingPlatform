import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("проверяем backend...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/health")
      .then((r) => r.json())
      .then((d) => setStatus("backend: " + d.status))
      .catch(() => setStatus("backend недоступен"));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>ReadingPlatform Frontend</h1>
      <p>{status}</p>
    </div>
  );
}

export default App;
