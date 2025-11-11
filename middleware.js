module.exports.isDoctor = (req, res, next) => {
  if (!req.session.userId) return res.redirect("/login");
  if (req.session.role !== "doctor") return res.send("Access denied (not a doctor)");
  next();
};
module.exports.isLoggedIn = (req, res, next) => {
  if (!req.session.userId) return res.redirect("/login");
  next();
};
module.exports.isAdmin = (req, res, next) => {
  if (req.session.role !== "admin") return res.redirect("/login");
  next();
};