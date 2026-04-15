"use client";

import React from "react";

export type ContactFormField = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  placeholder?: string;
  required?: boolean | string;
  options?: string[] | string;
};

export interface ContactFormProps {
  title?: string;
  description?: string;
  submitText?: string;
  privacyNote?: string;
  actionUrl?: string;
  siteKey?: string;
  fields?: ContactFormField[];
}

const DEFAULT_FIELDS: ContactFormField[] = [
  { name: "name", label: "姓名", type: "text", placeholder: "请输入您的姓名", required: true },
  { name: "phone", label: "电话", type: "tel", placeholder: "请输入联系电话", required: true },
  { name: "email", label: "邮箱", type: "email", placeholder: "请输入邮箱地址" },
  { name: "company", label: "公司", type: "text", placeholder: "请输入公司名称" },
  { name: "message", label: "需求说明", type: "textarea", placeholder: "请描述您的项目需求", required: true },
];

const normalizeType = (value?: string) => {
  if (value === "email" || value === "tel" || value === "textarea" || value === "select") return value;
  return "text";
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

const normalizeOptions = (value: ContactFormField["options"]) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
};

export const ContactForm = ({
  title = "在线留言",
  description = "请填写以下信息，我们会尽快与您联系。",
  submitText = "提交信息",
  privacyNote = "提交即表示您同意我们联系您并处理相关咨询。",
  actionUrl = "#",
  siteKey = "",
  fields = DEFAULT_FIELDS,
}: ContactFormProps) => {
  const safeFields = (fields.length ? fields : DEFAULT_FIELDS).map((field, index) => ({
    ...field,
    name: field.name || `field_${index + 1}`,
    label: field.label || `字段${index + 1}`,
    type: normalizeType(field.type),
    required: toBoolean(field.required),
    options: normalizeOptions(field.options),
  }));

  return (
    <section className="py-24 bg-slate-50">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 md:p-12 shadow-sm">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">{title}</h2>
          {description ? <p className="text-slate-600 mb-10">{description}</p> : null}

          <form action={actionUrl} method="post" className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {siteKey ? <input type="hidden" name="_site_key" value={siteKey} /> : null}
            {safeFields.map((field) => {
              const isTextarea = field.type === "textarea";
              const isSelect = field.type === "select";
              const fieldClass = isTextarea ? "md:col-span-2" : "md:col-span-1";

              return (
                <div key={field.name} className={fieldClass}>
                  <label htmlFor={field.name} className="block text-sm font-semibold text-slate-700 mb-2">
                    {field.label}
                    {field.required ? <span className="text-red-500 ml-1">*</span> : null}
                  </label>

                  {isTextarea ? (
                    <textarea
                      id={field.name}
                      name={field.name}
                      required={field.required}
                      placeholder={field.placeholder || ""}
                      rows={5}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : isSelect ? (
                    <select
                      id={field.name}
                      name={field.name}
                      required={field.required}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        {field.placeholder || `请选择${field.label}`}
                      </option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      required={field.required}
                      placeholder={field.placeholder || ""}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              );
            })}

            <div className="md:col-span-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pt-2">
              <p className="text-xs text-slate-500">{privacyNote}</p>
              <button
                type="submit"
                className="inline-flex justify-center items-center rounded-xl bg-blue-600 text-white font-semibold px-8 py-3 hover:bg-blue-700 transition-colors"
              >
                {submitText}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};
