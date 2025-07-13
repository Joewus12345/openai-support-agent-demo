import { ChatMessage } from "@/lib/assistant";
import React from "react";
import ReactMarkdown from "react-markdown";
import ImageModal from "./ImageModal";

const markdownComponents = {
  img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <ImageModal src={props.src ?? ""}>
      <img
        {...props}
        alt={props.alt || "image"}
        className="w-24 h-24 object-cover rounded-md cursor-pointer"
      />
    </ImageModal>
  ),
};

interface MessageProps {
  message: ChatMessage;
  view: "user" | "agent";
  suggestion?: boolean;
}

const Message: React.FC<MessageProps> = ({
  message,
  view,
  suggestion = false,
}) => {
  const item = message.content[0];
  return (
    <div className="text-sm">
      {(message.role === "user" && view === "user") ||
      (message.role === "agent" && view === "agent") ? (
        <div className="flex justify-end">
          <div>
            <div
              className={`ml-4 rounded-[16px] rounded-br-[4px] px-4 py-2 md:ml-24 bg-black text-white  font-light ${
                suggestion
                  ? "bg-zinc-50 text-zinc-900 shadow-lg border border-zinc-100"
                  : ""
              }`}
            >
              <div>
                <div>
                  {item.type === "output_image" && item.image_url ? (
                    <ImageModal src={item.image_url}>
                      <img
                        src={item.image_url}
                        alt="image"
                        className="w-24 h-24 object-cover rounded-md cursor-pointer"
                      />
                    </ImageModal>
                  ) : (
                    <ReactMarkdown components={markdownComponents}>
                      {item.text as string}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex">
            <div className="mr-4 rounded-[16px] rounded-bl-[4px] px-4 py-2 md:mr-24 text-zinc-900 bg-[#ECECF1] font-light">
              <div>
                {item.type === "output_image" && item.image_url ? (
                  <ImageModal src={item.image_url}>
                    <img
                      src={item.image_url}
                      alt="image"
                      className="w-24 h-24 object-cover rounded-md cursor-pointer"
                    />
                  </ImageModal>
                ) : (
                  <ReactMarkdown components={markdownComponents}>
                    {item.text as string}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Message;
