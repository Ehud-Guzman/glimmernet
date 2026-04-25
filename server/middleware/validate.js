const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,   // removes any field not in the schema — mass-assignment protection
    convert: true,        // coerce "10" → 10, "true" → true, etc.
  });

  if (error) {
    const message = error.details.map((d) => d.message.replace(/['"]/g, '')).join('; ');
    return res.status(400).json({ success: false, message });
  }

  req.body = value;
  next();
};

module.exports = validate;
