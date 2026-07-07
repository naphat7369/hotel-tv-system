import { useState, useEffect } from 'react';

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
    </>
  );
}
