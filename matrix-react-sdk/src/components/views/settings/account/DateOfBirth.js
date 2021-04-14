/*
Copyright 2019 New Vector Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from 'react';
import PropTypes from 'prop-types';
import {_t} from "../../../../languageHandler";
import Field from "../../elements/Field";
import AccessibleButton from "../../elements/AccessibleButton";
import {MatrixClientPeg} from "../../../../MatrixClientPeg";
import createReactClass from "create-react-class";
import withValidation from "../../elements/Validation";

/*
TODO: Improve the UX for everything in here.
It's very much placeholder, but it gets the job done. The old way of handling
email addresses in user settings was to use dialogs to communicate state, however
due to our dialog system overriding dialogs (causing unmounts) this creates problems
for a sane UX. For instance, the user could easily end up entering an email address
and receive a dialog to verify the address, which then causes the component here
to forget what it was doing and ultimately fail. Dialogs are still used in some
places to communicate errors - these should be replaced with inline validation when
that is available.
 */

const FIELD_BIRTHDAY = 'field_birthday';
const FIELD_GENDER = 'field_gender';
function birthdayValid(value) {
    const now = new Date();
    let birthday = Date.parse(value);
    let date = value.split('-');
    let year = parseInt(date[0]);
    let check = false;
    if (birthday < now &&  year>=1900){
        check = true;
    }
    return check;
}
export default createReactClass({
    displayName: 'DateOfBirth',
    propTypes : {
        dateOfBirth: PropTypes.string,
        gender: PropTypes.string,
        genderUpdateSuccess: PropTypes.bool,
        birthdayUpdateSuccess: PropTypes.bool,
    },

    getInitialState: function () {
        return {
            birthday: this.props.dateOfBirth || "",
            gender: this.props.gender || "",
            genderUpdateSuccess: true,
            birthdayUpdateSuccess: true,
        };
    },

    render() {
        let updateButton = (
            <AccessibleButton onClick={this._onUpdateBirthday} disabled={this.state.birthdayUpdateSuccess} kind="primary">
                {_t("Update")}
            </AccessibleButton>
        );
        let updateGenderButton = (
            <AccessibleButton onClick={this._onUpdateGender} disabled={this.state.genderUpdateSuccess} kind="primary">
                {_t("Update")}
            </AccessibleButton>
        );
        return (
            <div className="mx_EmailAddresses">
                <form onSubmit={this._onUpdateBirthday} autoComplete="off"
                      noValidate={true} className="mx_EmailAddresses_new">
                    <Field
                        type="date"
                        id="mx_RegistrationForm_birthday_edit"
                        ref={field => this[FIELD_BIRTHDAY] = field}
                        label={_t("Birthday")}
                        autoComplete="off"
                        value={this.state.birthday}
                        onChange={this.onBirthdayChange}
                        onValidate={this.onBirthdayValidate}
                    />
                    {updateButton}
                </form>
                <form onSubmit={this._onUpdateGender} autoComplete="off"
                      noValidate={true} className="mx_EmailAddresses_new">
                    <span className="mx_ExistingEmailAddress_promptText">{_t(
                        "Gender",
                    )}</span>
                    <div className="mx_ThemeSelectors">
                        <input type="radio" value="male" name="gender" checked={this.state.gender === 'male'} onChange={this.onGenderChange}/> {_t("Male")}
                        <input type="radio" value="female" name="gender" checked={this.state.gender === 'female'} onChange={this.onGenderChange}/> {_t("Female")}
                        <input type="radio" value="other" name="gender" checked={this.state.gender === 'other'} onChange={this.onGenderChange}/> {_t("Other")}
                    </div>
                    {updateGenderButton}
                </form>
            </div>
        );
    },

    markFieldValid: function (fieldID, valid) {
        const {fieldValid} = this.state;
        fieldValid[fieldID] = valid;
        this.setState({
            fieldValid,
        });
    },

    onBirthdayChange(ev) {
        this.setState({
            birthday: ev.target.value,
            birthdayUpdateSuccess: false,
        });
    },

    onGenderChange(ev) {
        this.setState({
            gender: ev.target.value,
            genderUpdateSuccess: false,
        });
    },
    validateBirthdayRules: withValidation({
        description: () => _t("Birthday can not greater than today and lower than 1900 !"),
        rules: [
            {
                key: "required",
                test: ({value, allowEmpty}) => allowEmpty || !!value,
                invalid: () => _t("Enter birthday"),
            },
            {
                key: "required",
                test: ({value}) => !value || birthdayValid(value),
                invalid: () => _t("Birthday can not greater than today and lower than 1900 !"),
            },
        ],
    }),
    async onBirthdayValidate(fieldState) {
        const result = await this.validateBirthdayRules(fieldState);
        // this.markFieldValid(FIELD_BIRTHDAY, result.valid);
        return result;
    },
    _onUpdateBirthday() {
        const client = MatrixClientPeg.get();
        const content = {
            date_of_birth: this.state.birthday
        }
        client.setBirthday(content).then(result => {
            if(result){
                this.setState({
                    birthdayUpdateSuccess: true,
                });
            }
        });
    },
    _onUpdateGender() {
        const client = MatrixClientPeg.get();
        const content = {
            gender: this.state.gender
        }
        client.setGender(content).then(result => {
            if(result){
                this.setState({
                    genderUpdateSuccess: true,
                });
            }
        });
    },
});
