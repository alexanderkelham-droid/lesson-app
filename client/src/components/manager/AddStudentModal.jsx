// Backward-compatibility shim — components that imported AddStudentModal now get AddUserModal.
// Maps the old `editStudent` prop to the new `editUser`.
import AddUserModal from './AddUserModal'

export default function AddStudentModal({ editStudent, ...props }) {
  return <AddUserModal {...props} editUser={editStudent} defaultRole="student" />
}
