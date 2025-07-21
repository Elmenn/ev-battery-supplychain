import React from "react";

function TruncatedText({ text, length = 12 }) {
  const start = text.slice(0, Math.floor(length / 2));
  const end = text.slice(-Math.ceil(length / 2));

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <span
      onClick={handleCopy}
      title="Click to copy full value"
      style={{
        fontFamily: "monospace",
        cursor: "pointer",
        background: "#eef",
        padding: "2px 4px",
        borderRadius: "4px",
      }}
    >
      {start}…{end}
    </span>
  );

}

export default TruncatedText;
